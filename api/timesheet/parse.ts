// Stateless HTML parser — no UCR requests, no session check.
// Called by the extension background.js after it fetches UCR HTML from the user's browser.
import type { VercelRequest, VercelResponse } from '@vercel/node';
import * as cheerio from 'cheerio';
import { applyCors } from '../_cors';

export interface JobInfo {
  jobKey: string;   // e.g. '40950425:0:D01003'
  jobCode: string;  // e.g. '40950425'
  label: string;    // e.g. 'Job 1 - 40950425'
  position: string; // e.g. 'TUT-NON GSHIP'
}

export default function handler(req: VercelRequest, res: VercelResponse) {
  if (applyCors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).end();

  const { sheetHtml, listHtml, appCookie, username } = (req.body ?? {}) as {
    sheetHtml?: string;
    listHtml?: string;
    appCookie?: string;
    username?: string;
  };

  if (!sheetHtml || !listHtml || !appCookie || !username) {
    return res.status(400).json({ error: 'sheetHtml, listHtml, appCookie, username required' });
  }

  const listInfo = parseListPage(listHtml, appCookie, username);
  if (!listInfo) return res.status(422).json({ error: 'Could not parse list page' });

  const { dayRows, employeeId, jobCode, flags, jobs } = parseSheetRows(sheetHtml);

  return res.status(200).json({ ...listInfo, employeeId, jobCode, flags, dayRows, jobs });
}

function parseListPage(html: string, appCookie: string, username: string) {
  const callMatch = html.match(
    /go_biweekly_timesheet\s*\(\s*['"]([^'"]+)['"]\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i,
  );
  if (!callMatch) return null;

  const [, netId, key, year, month] = callMatch;
  const labelMatch =
    html.match(/<B>([^<]*\d{4}[^<]*-[^<]*\d{4}[^<]*)<\/B>/i) ??
    html.match(/<b>([A-Za-z]+ \d+,? \d{4}[^<]+-[^<]+)<\/b>/i);
  const periodLabel = labelMatch ? labelMatch[1].trim() : 'Current period';

  return { appCookie, key, netId: netId || username, year, month, periodLabel };
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractJobHoursDisplay(html: string, jobKey: string, nDate: string): string {
  const m = html.match(
    new RegExp(`id="Job-${escapeRe(jobKey)}-${nDate}"[^>]*>([\\s\\S]*?)<\\/span>`, 'i'),
  );
  if (!m) return '';
  const text = m[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  return /click to add/i.test(text) ? '' : text;
}

function parseSheetRows(html: string) {
  const empIdMatch = html.match(/vEmployeeID:\s*(\d+)/i);
  const employeeId = empIdMatch?.[1] ?? '';

  const jsVar = (name: string, def: string) =>
    html.match(new RegExp(`var ${name}\\s*=\\s*"([^"]+)"`, 'i'))?.[1] ?? def;

  const flags = {
    vHasSKL: jsVar('sHasSKL', 'N'), vHasVAC: jsVar('sHasVAC', 'N'),
    vHasCTA: jsVar('sHasCTA', 'N'), vHasPTO: jsVar('sHasPTO', 'N'),
    vHasHun: jsVar('sHasHUN', 'N'), vOvertime: jsVar('sOvertime', 'N'),
    vEmployeeType: jsVar('sEmployeeType', 'BX'),
    vOnLeave: 'N', vCurtailmentPeriod: 'N', vIsGSR: 'N', vIsASE: 'Y',
  };

  const holidayMap = new Map<string, string>();
  for (const m of html.matchAll(/id="isHoliday(\d+)"\s+value="([^"]+)"/gi)) {
    holidayMap.set(m[1], m[2]);
  }

  const $ = cheerio.load(html);

  // Parse job columns from thead
  const jobs: JobInfo[] = [];

  $('thead th').each((_, el) => {
    const cls = $(el).attr('class') ?? '';
    const topMatch = cls.match(/^job(\d+)_top$/);
    if (topMatch) {
      const idx = parseInt(topMatch[1], 10) - 1;
      while (jobs.length <= idx) jobs.push({ jobKey: '', jobCode: '', label: '', position: '' });
      jobs[idx].label = $(el).text().trim();
    }
    const posMatch = cls.match(/^job(\d+)$/);
    if (posMatch) {
      const idx = parseInt(posMatch[1], 10) - 1;
      while (jobs.length <= idx) jobs.push({ jobKey: '', jobCode: '', label: '', position: '' });
      jobs[idx].position = $(el).find('a').text().trim();
    }
  });

  const dayRows: Array<{
    dayName: string;
    nDate: string;
    isHoliday: string;
    hoursDisplay: string;
    jobHours: Record<string, string>;
    dateLabel: string;
  }> = [];

  $('tbody tr').each((_, row) => {
    const boldText = $(row).find('td.dayOfMonth b').text().trim();
    if (!boldText) return;

    const dayNameMatch = boldText.match(/^(SUNDAY|MONDAY|TUESDAY|WEDNESDAY|THURSDAY|FRIDAY|SATURDAY)/i);
    if (!dayNameMatch) return;
    const dayName = dayNameMatch[1].charAt(0) + dayNameMatch[1].slice(1).toLowerCase();

    // nDate from first job cell onclick
    const firstOnclick = $(row).find('td[class^="job"]').first().attr('onclick') ?? '';
    const ghFirst = firstOnclick.match(/GetHours\s*\((\d+),/i);
    if (!ghFirst) return;
    const nDate = ghFirst[1];

    const isHoliday = holidayMap.get(nDate) ?? 'N';

    const dateMatch = boldText.slice(dayNameMatch[1].length).trim().match(/([A-Z]+)\s+(\d+)/i);
    const dateLabel = dateMatch
      ? `${dateMatch[1].charAt(0).toUpperCase() + dateMatch[1].slice(1).toLowerCase()} ${parseInt(dateMatch[2], 10)}`
      : '';

    // Per-job hours
    const jobHours: Record<string, string> = {};
    $(row).find('td[class^="job"]').each((jobIdx, cell) => {
      const onclick = $(cell).attr('onclick') ?? '';
      const m = onclick.match(/GetHours\s*\(\d+,\s*\d+,\s*'([^']+)'\)/i);
      if (!m) return;
      const jobKey = m[1];
      const jobCode = jobKey.split(':')[0];

      // Fill job metadata on first encounter
      while (jobs.length <= jobIdx) jobs.push({ jobKey: '', jobCode: '', label: '', position: '' });
      if (!jobs[jobIdx].jobKey) {
        jobs[jobIdx].jobKey = jobKey;
        jobs[jobIdx].jobCode = jobCode;
      }

      jobHours[jobKey] = extractJobHoursDisplay(html, jobKey, nDate);
    });

    const hoursDisplay = jobs[0]?.jobKey ? (jobHours[jobs[0].jobKey] ?? '') : '';

    dayRows.push({ dayName, nDate, isHoliday, hoursDisplay, jobHours, dateLabel });
  });

  // jobCode = first job's full key (used by background.js for save operations)
  const jobCode = jobs[0]?.jobKey ?? '';

  return { dayRows, employeeId, jobCode, flags, jobs };
}
