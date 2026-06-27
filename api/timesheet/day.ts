import type { VercelRequest, VercelResponse } from '@vercel/node';
import axios from 'axios';
import { parse as parseCookies } from 'cookie';
import { applyCors } from '../_cors';
import { parseSession } from '../auth/login';
import type { TimesheetInfo } from './current';

const BASE = 'https://timesheet.ucr.edu/timesheet2';
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36';

export interface DayTimeEntry {
  timeIn: string; // "5" (12-hour, no leading zero)
  ampmIn: 'am' | 'pm';
  timeOut: string;
  ampmOut: 'am' | 'pm';
}

function toHour24(time: string, ampm: 'am' | 'pm'): number {
  const h = parseInt(time, 10);
  if (ampm === 'pm' && h !== 12) return h + 12;
  if (ampm === 'am' && h === 12) return 0;
  return h;
}

function buildHoursString(entries: DayTimeEntry[], jobCode: string, payCode: string): string {
  const lines = entries.map(
    (e) =>
      `${toHour24(e.timeIn, e.ampmIn)}\t${toHour24(e.timeOut, e.ampmOut)}\tREG\t${payCode}\t\t${jobCode}\t\t`
  );
  lines.push(`-1\t-1\tREG\t${payCode}\t\t${jobCode}\t\t`);
  return lines.join('\n') + '\n';
}

function parsePayCode(html: string): string {
  return (
    html.match(/payCode['":\s=]+['"]?(\d+)['"]?/i)?.[1] ??
    html.match(/REG[^0-9]*(\d{2,3})/)?.[1] ??
    '97'
  );
}

// Parse time entries from the InputHours form HTML.
// Fields: id="TimeIn1", id="TimeOut1", id="ampm1" (in), id="ampm2" (out),
// then TimeIn2/TimeOut2/ampm3/ampm4 for the second entry, etc.
function parseTimeEntries(html: string): DayTimeEntry[] {
  const entries: DayTimeEntry[] = [];

  for (let i = 1; i <= 10; i++) {
    const timeIn =
      html
        .match(new RegExp(`id=["']TimeIn${i}["'][^>]*value=["']([^"']+)["']`, 'i'))?.[1]
        ?.trim() ??
      html.match(new RegExp(`value=["']([^"']+)["'][^>]*id=["']TimeIn${i}["']`, 'i'))?.[1]?.trim();

    if (!timeIn || timeIn === '-1' || timeIn === '') break;

    const timeOut =
      html
        .match(new RegExp(`id=["']TimeOut${i}["'][^>]*value=["']([^"']+)["']`, 'i'))?.[1]
        ?.trim() ??
      html
        .match(new RegExp(`value=["']([^"']+)["'][^>]*id=["']TimeOut${i}["']`, 'i'))?.[1]
        ?.trim() ??
      '';

    const ampmInIdx = (i - 1) * 2 + 1;
    const ampmOutIdx = (i - 1) * 2 + 2;

    entries.push({
      timeIn,
      ampmIn: parseAmpm(html, ampmInIdx),
      timeOut,
      ampmOut: parseAmpm(html, ampmOutIdx),
    });
  }

  return entries;
}

function parseAmpm(html: string, idx: number): 'am' | 'pm' {
  const selectMatch = html.match(new RegExp(`id=["']ampm${idx}["'][\\s\\S]*?</select>`, 'i'));
  if (selectMatch) {
    const block = selectMatch[0];
    const sel =
      block.match(/<option[^>]+selected[^>]*value=["'](AM|PM)["']/i) ??
      block.match(/<option[^>]+value=["'](AM|PM)["'][^>]*selected/i);
    if (sel) return sel[1].toLowerCase() as 'am' | 'pm';
  }
  return 'pm';
}

// Shared: fetch full timesheet info (mirrors fetchTimesheetInfo in save.ts)
async function getInfo(appCookie: string, cookieHeader: string): Promise<TimesheetInfo | null> {
  const headers = { Cookie: cookieHeader, 'User-Agent': UA };

  const listResp = await axios.get<string>(
    `${BASE}/TIMESHEET_MAIN.VIEW_USER_TIMESHEET_LIST?cookie=${appCookie}`,
    { headers, validateStatus: () => true }
  );
  if (listResp.status !== 200) return null;

  const listHtml = listResp.data as string;
  const m = listHtml.match(
    /go_biweekly_timesheet\s*\(\s*['"]([^'"]+)['"]\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i
  );
  if (!m) return null;

  const [, netId, key, year, month] = m;
  const labelMatch = listHtml.match(/<B>([^<]*\d{4}[^<]*-[^<]*\d{4}[^<]*)<\/B>/i);
  const periodLabel = labelMatch?.[1]?.trim() ?? 'Current period';

  const updateParams = new URLSearchParams({
    cookie: appCookie,
    v_user_netid: netId,
    v_timesheet_id: key,
    v_year: year,
    v_month: month,
    v_style_hour: '8',
    v_style_code: '1',
    v_type: 'USER',
  });
  await axios.post(`${BASE}/TIMESHEET_MAIN.update_cookie_User_list?${updateParams}`, null, {
    headers,
    validateStatus: () => true,
  });
  await axios.get(`${BASE}/Timesheet_biweekly_main.LoadTimesheet?cookie=${appCookie}`, {
    headers,
    maxRedirects: 5,
    validateStatus: () => true,
  });

  const sheetResp = await axios.get<string>(
    `${BASE}/Timesheet_BiWeekly_Main.Timesheet?cookie=${appCookie}`,
    { headers, validateStatus: () => true }
  );
  const sheetHtml = sheetResp.data as string;

  const employeeId = sheetHtml.match(/vEmployeeID:\s*(\d+)/i)?.[1] ?? '';
  const jobCode = sheetHtml.match(/GetHours\s*\(\d+,\s*\d+,\s*'([^']+)'\)/i)?.[1] ?? '';

  const holidayMap = new Map<string, string>();
  for (const hm of sheetHtml.matchAll(/id="isHoliday(\d+)"\s+value="([^"]+)"/gi))
    holidayMap.set(hm[1], hm[2]);

  const dayRows: TimesheetInfo['dayRows'] = [];
  for (const rm of sheetHtml.matchAll(
    /<tr[^>]*>.*?<b>(SUNDAY|MONDAY|TUESDAY|WEDNESDAY|THURSDAY|FRIDAY|SATURDAY)[^<]*<\/b>.*?GetHours\s*\((\d+),/gis
  )) {
    const raw = rm[1];
    const nDate = rm[2];
    const spanM = sheetHtml.match(
      new RegExp(
        `<span[^>]*class="current_span"[^>]*id="[^"]*-${nDate}"[^>]*>([\\s\\S]*?)<\\/span>`,
        'i'
      )
    );
    const spanText = spanM
      ? spanM[1]
          .replace(/<[^>]+>/g, '')
          .replace(/\s+/g, ' ')
          .trim()
      : '';
    dayRows.push({
      dayName: raw.charAt(0) + raw.slice(1).toLowerCase(),
      nDate,
      isHoliday: holidayMap.get(nDate) ?? 'N',
      hoursDisplay: /click to add/i.test(spanText) ? '' : spanText,
      dateLabel: '',
    });
  }

  const jsVar = (name: string, def: string) =>
    sheetHtml.match(new RegExp(`var ${name}\\s*=\\s*"([^"]+)"`, 'i'))?.[1] ?? def;
  const flags = {
    vHasSKL: jsVar('sHasSKL', 'N'),
    vHasVAC: jsVar('sHasVAC', 'N'),
    vHasCTA: jsVar('sHasCTA', 'N'),
    vHasPTO: jsVar('sHasPTO', 'N'),
    vHasHun: jsVar('sHasHUN', 'N'),
    vOvertime: jsVar('sOvertime', 'N'),
    vEmployeeType: jsVar('sEmployeeType', 'BX'),
    vOnLeave: 'N',
    vCurtailmentPeriod: 'N',
    vIsGSR: 'N',
    vIsASE: 'Y',
  };

  return { appCookie, key, netId, year, month, periodLabel, employeeId, jobCode, flags, dayRows };
}

async function callInputHours(
  appCookie: string,
  headers: Record<string, string>,
  info: TimesheetInfo,
  nDate: string
) {
  const dayRow = info.dayRows.find((r) => r.nDate === nDate);
  return axios.post<string>(
    `${BASE}/timesheet_biweekly_main.InputHours`,
    new URLSearchParams({
      cookie: appCookie,
      nDate,
      key: info.key,
      vEmployeeID: info.employeeId,
      vHasSKL: info.flags.vHasSKL,
      vHasVAC: info.flags.vHasVAC,
      vHasCTA: info.flags.vHasCTA,
      vHasPTO: info.flags.vHasPTO,
      vHasHun: info.flags.vHasHun,
      vOvertime: info.flags.vOvertime,
      vEmployeeType: info.flags.vEmployeeType,
      vOnLeave: info.flags.vOnLeave,
      vIsHoliday: dayRow?.isHoliday ?? 'N',
      vJob: info.jobCode,
      vCurtailmentPeriod: info.flags.vCurtailmentPeriod,
      vIsGSR: info.flags.vIsGSR,
      vIsASE: info.flags.vIsASE,
    }).toString(),
    { headers, validateStatus: () => true }
  );
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (applyCors(req, res)) return;

  const cookies = parseCookies(req.headers.cookie ?? '');
  if (!cookies['ts_session']) return res.status(401).json({ error: 'SESSION_EXPIRED' });

  let session: ReturnType<typeof parseSession>;
  try {
    session = parseSession(cookies['ts_session']);
  } catch {
    return res.status(401).json({ error: 'SESSION_EXPIRED' });
  }

  const { appCookie, cookieHeader } = session;
  const formHeaders = {
    Cookie: cookieHeader,
    'Content-Type': 'application/x-www-form-urlencoded',
    'User-Agent': UA,
  };

  try {
    const info = await getInfo(appCookie, cookieHeader);
    if (!info) return res.status(503).json({ error: 'Could not load timesheet' });

    // ── GET: fetch current times for one day ──────────────────────────────────
    if (req.method === 'GET') {
      const nDate = String(req.query.nDate ?? '');
      if (!nDate || !/^\d+$/.test(nDate)) return res.status(400).json({ error: 'nDate required' });

      const inputResp = await callInputHours(appCookie, formHeaders, info, nDate);
      const entries = parseTimeEntries(inputResp.data as string);
      return res.status(200).json({ entries });
    }

    // ── POST: save times for one day ─────────────────────────────────────────
    if (req.method === 'POST') {
      const { nDate, entries } = (req.body ?? {}) as { nDate?: string; entries?: DayTimeEntry[] };
      if (!nDate) return res.status(400).json({ error: 'nDate required' });

      const inputResp = await callInputHours(appCookie, formHeaders, info, nDate);
      const payCode = parsePayCode(inputResp.data as string);

      const vHoursString =
        entries && entries.length > 0
          ? buildHoursString(entries, info.jobCode, payCode)
          : `-1\t-1\tREG\t${payCode}\t\t${info.jobCode}\t\t\n`;

      await axios.post(
        `${BASE}/timesheet_biweekly_main.SaveTimesheetHours`,
        new URLSearchParams({
          key: info.key,
          cookie: appCookie,
          vDate: nDate,
          vHoursString,
          vDayString: '',
        }).toString(),
        { headers: formHeaders, validateStatus: () => true }
      );
      await axios.post(
        `${BASE}/TIMESHEET_Biweekly_main.DisplayTimesheetMessages`,
        new URLSearchParams({ cookie: appCookie, nkey: info.key }).toString(),
        { headers: formHeaders, validateStatus: () => true }
      );
      await axios.post(
        `${BASE}/timesheet_biweekly_main.savetimesheet`,
        new URLSearchParams({ key: info.key, cookie: appCookie, v_submit_type: 'SAVE' }).toString(),
        { headers: formHeaders, validateStatus: () => true }
      );

      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[timesheet/day] error:', msg);
    return res.status(502).json({ error: msg });
  }
}
