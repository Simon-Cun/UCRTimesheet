// Stateless HTML parser — no UCR requests, no session check.
// Called by the extension background.js after it fetches UCR HTML from the user's browser.
import type { VercelRequest, VercelResponse } from '@vercel/node';
import * as cheerio from 'cheerio';
import { applyCors } from '../_cors';

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

  const { dayRows, employeeId, jobCode, flags } = parseSheetRows(sheetHtml);

  return res.status(200).json({ ...listInfo, employeeId, jobCode, flags, dayRows });
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

function extractHoursDisplay(html: string, nDate: string): string {
  const m = html.match(
    new RegExp(
      `<span[^>]+class="current_span"[^>]+id="[^"]*-${nDate}"[^>]*>([\\s\\S]*?)<\\/span>`,
      'i',
    ),
  );
  if (!m) return '';
  const text = m[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  return /click to add/i.test(text) ? '' : text;
}

function parseSheetRows(html: string) {
  const empIdMatch = html.match(/vEmployeeID:\s*(\d+)/i);
  const employeeId = empIdMatch?.[1] ?? '';

  const jobMatch = html.match(/GetHours\s*\(\d+,\s*\d+,\s*'([^']+)'\)/i);
  const jobCode = jobMatch?.[1] ?? '';

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

  const dayRows: Array<{ dayName: string; nDate: string; isHoliday: string; hoursDisplay: string; dateLabel: string }> = [];
  const $ = cheerio.load(html);

  $('tr').each((_, row) => {
    const boldText = $(row).find('td.dayOfMonth b').text().trim();
    if (!boldText) return;

    const dayNameMatch = boldText.match(/^(SUNDAY|MONDAY|TUESDAY|WEDNESDAY|THURSDAY|FRIDAY|SATURDAY)/i);
    if (!dayNameMatch) return;
    const dayName = dayNameMatch[1].charAt(0) + dayNameMatch[1].slice(1).toLowerCase();

    const onclick = $(row).find('td.job1').attr('onclick') ?? '';
    const ghMatch = onclick.match(/GetHours\s*\((\d+),/i);
    if (!ghMatch) return;

    const nDate = ghMatch[1];
    const isHoliday = holidayMap.get(nDate) ?? 'N';
    const hoursDisplay = extractHoursDisplay(html, nDate);
    const dateMatch = boldText.slice(dayNameMatch[1].length).trim().match(/([A-Z]+)\s+(\d+)/i);
    const dateLabel = dateMatch
      ? `${dateMatch[1].charAt(0).toUpperCase() + dateMatch[1].slice(1).toLowerCase()} ${parseInt(dateMatch[2], 10)}`
      : '';

    dayRows.push({ dayName, nDate, isHoliday, hoursDisplay, dateLabel });
  });

  return { dayRows, employeeId, jobCode, flags };
}
