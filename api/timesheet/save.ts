import type { VercelRequest, VercelResponse } from '@vercel/node';
import axios from 'axios';
import { parse as parseCookies } from 'cookie';
import { applyCors } from '../_cors';
import { parseSession } from '../auth/login';
import { type TimesheetInfo } from './current';

const BASE = 'https://timesheet.ucr.edu/timesheet2';

export interface ScheduleEntry {
  timeIn: string; // "05:00"
  ampmIn: 'am' | 'pm';
  timeOut: string; // "07:00"
  ampmOut: 'am' | 'pm';
}

export type Schedule = Record<string, ScheduleEntry[]>;

interface SubmitPayload {
  schedule: Schedule;
}

interface SubmitLog {
  day: string;
  nDate: string;
  status: 'ok' | 'error';
  message?: string;
}

// Convert "05:00" + "pm" → 17 (24-hour integer, whole hours only)
function toHour24(time: string, ampm: 'am' | 'pm'): number {
  const hour = parseInt(time.split(':')[0], 10);
  if (ampm === 'pm' && hour !== 12) return hour + 12;
  if (ampm === 'am' && hour === 12) return 0;
  return hour;
}

// Build the vHoursString for SaveTimesheetHours.
// Format (tab-separated, newline-terminated rows):
//   {inHour24}\t{outHour24}\tREG\t{payCode}\t\t{jobCode}\t\t\n
//   -1\t-1\tREG\t{payCode}\t\t{jobCode}\t\t\n
// The second row is always an empty-sentinel row the server expects.
function buildHoursString(entries: ScheduleEntry[], jobCode: string, payCode: string): string {
  const lines: string[] = [];
  for (const e of entries) {
    const inH = toHour24(e.timeIn, e.ampmIn);
    const outH = toHour24(e.timeOut, e.ampmOut);
    lines.push(`${inH}\t${outH}\tREG\t${payCode}\t\t${jobCode}\t\t`);
  }
  // Always append the sentinel empty row
  lines.push(`-1\t-1\tREG\t${payCode}\t\t${jobCode}\t\t`);
  return lines.join('\n') + '\n';
}

// Parse the pay code from the InputHours response HTML.
// The modal form typically has a hidden input like <input name="payCode" value="97">
// or the pay code is embedded in the hours string template in the JS.
function parsePayCode(html: string): string {
  const match = html.match(/payCode['":\s=]+['"]?(\d+)['"]?/i) ?? html.match(/REG[^0-9]*(\d{2,3})/); // fallback: first 2-3 digit number after "REG"
  return match?.[1] ?? '97'; // 97 is this employee's pay code per traffic capture
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (applyCors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const cookies = parseCookies(req.headers.cookie ?? '');
  if (!cookies['ts_session']) return res.status(401).json({ error: 'SESSION_EXPIRED' });

  let session: ReturnType<typeof parseSession>;
  try {
    session = parseSession(cookies['ts_session']);
  } catch {
    return res.status(401).json({ error: 'SESSION_EXPIRED' });
  }

  const { schedule } = (req.body ?? {}) as Partial<SubmitPayload>;
  if (!schedule || Object.keys(schedule).length === 0) {
    return res.status(400).json({ error: 'Schedule is required' });
  }

  const { appCookie, cookieHeader } = session;
  const headers = {
    Cookie: cookieHeader,
    'Content-Type': 'application/x-www-form-urlencoded',
    'User-Agent':
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
  };

  try {
    // ── Phase 1: Fetch current timesheet info (period, employee params, day rows) ──
    // Reuse the current handler logic by calling it internally via a fake request.
    // We need: key, netId, employeeId, jobCode, flags, dayRows.
    const info = await fetchTimesheetInfo(appCookie, cookieHeader);
    if (!info) {
      return res.status(503).json({ error: 'Could not load timesheet. Session may have expired.' });
    }

    const { key, employeeId, jobCode, flags, dayRows } = info;
    const log: SubmitLog[] = [];

    // ── Phase 2: Submit entries for each scheduled day ──
    for (const [dayName, entries] of Object.entries(schedule)) {
      // Find all occurrences of this day in the current biweekly period
      const occurrences = dayRows.filter((r) => r.dayName.toLowerCase() === dayName.toLowerCase());

      if (occurrences.length === 0) {
        log.push({
          day: dayName,
          nDate: '-',
          status: 'error',
          message: 'Day not found in timesheet',
        });
        continue;
      }

      for (const occ of occurrences) {
        const { nDate, isHoliday } = occ;

        try {
          // Step A: POST InputHours — opens the time entry form for this day.
          // The response HTML contains the pay code and form structure.
          const inputResp = await axios.post<string>(
            `${BASE}/timesheet_biweekly_main.InputHours`,
            new URLSearchParams({
              cookie: appCookie,
              nDate,
              key,
              vEmployeeID: employeeId,
              vHasSKL: flags.vHasSKL,
              vHasVAC: flags.vHasVAC,
              vHasCTA: flags.vHasCTA,
              vHasPTO: flags.vHasPTO,
              vHasHun: flags.vHasHun,
              vOvertime: flags.vOvertime,
              vEmployeeType: flags.vEmployeeType,
              vOnLeave: flags.vOnLeave,
              vIsHoliday: isHoliday,
              vJob: jobCode,
              vCurtailmentPeriod: flags.vCurtailmentPeriod,
              vIsGSR: flags.vIsGSR,
              vIsASE: flags.vIsASE,
            }).toString(),
            { headers, validateStatus: () => true }
          );

          const payCode = parsePayCode(inputResp.data as string);
          const vHoursString = buildHoursString(entries, jobCode, payCode);

          // Step B: POST SaveTimesheetHours — submits the time values for this day.
          const saveHoursResp = await axios.post<string>(
            `${BASE}/timesheet_biweekly_main.SaveTimesheetHours`,
            new URLSearchParams({
              key,
              cookie: appCookie,
              vDate: nDate,
              vHoursString,
              vDayString: '',
            }).toString(),
            { headers, validateStatus: () => true }
          );

          // Step C: POST DisplayTimesheetMessages — acknowledge any server messages.
          await axios.post(
            `${BASE}/TIMESHEET_Biweekly_main.DisplayTimesheetMessages`,
            new URLSearchParams({ cookie: appCookie, nkey: key }).toString(),
            { headers, validateStatus: () => true }
          );

          const saveBody = (saveHoursResp.data as string).slice(0, 200);
          log.push({
            day: dayName,
            nDate,
            status: 'ok',
            message: `HTTP ${saveHoursResp.status}: ${saveBody}`,
          });
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          log.push({ day: dayName, nDate, status: 'error', message: msg });
        }
      }
    }

    // ── Phase 3: Final save ──
    const saveResp = await axios.post(
      `${BASE}/timesheet_biweekly_main.savetimesheet`,
      new URLSearchParams({
        key,
        cookie: appCookie,
        v_submit_type: 'SAVE',
      }).toString(),
      { headers, validateStatus: () => true }
    );

    const allOk = log.every((l) => l.status === 'ok');

    return res.status(200).json({
      success: allOk,
      saveStatus: saveResp.status,
      log,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[timesheet/submit] error:', message);
    if (axios.isAxiosError(err) && (err.response?.status === 401 || err.response?.status === 403)) {
      return res.status(401).json({ error: 'SESSION_EXPIRED' });
    }
    return res.status(502).json({ error: 'Failed to submit timesheet: ' + message });
  }
}

// Run the same logic as current.ts without going through HTTP.
// Avoids a self-referential HTTP call in serverless/local environments.
async function fetchTimesheetInfo(
  appCookie: string,
  cookieHeader: string
): Promise<TimesheetInfo | null> {
  const headers = {
    Cookie: cookieHeader,
    'User-Agent':
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
  };

  // Get the timesheet list
  const listResp = await axios.get<string>(
    `${BASE}/TIMESHEET_MAIN.VIEW_USER_TIMESHEET_LIST?cookie=${appCookie}`,
    { headers, validateStatus: () => true }
  );
  if (listResp.status !== 200) return null;

  // Parse go_biweekly_timesheet('SCUN002', 1298141, 0, 351, 8, 1)
  const listHtml = listResp.data as string;
  const callMatch = listHtml.match(
    /go_biweekly_timesheet\s*\(\s*['"]([^'"]+)['"]\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i
  );
  if (!callMatch) return null;

  const netId = callMatch[1];
  const key = callMatch[2];
  const year = callMatch[3];
  const month = callMatch[4];

  const labelMatch = listHtml.match(/<B>([^<]*\d{4}[^<]*-[^<]*\d{4}[^<]*)<\/B>/i);
  const periodLabel = labelMatch ? labelMatch[1].trim() : 'Current period';

  // Select the timesheet — params go in URL query string, POST body is empty
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

  // Load biweekly sheet
  await axios.get(`${BASE}/Timesheet_biweekly_main.LoadTimesheet?cookie=${appCookie}`, {
    headers,
    maxRedirects: 5,
    validateStatus: () => true,
  });
  const sheetResp = await axios.get<string>(
    `${BASE}/Timesheet_BiWeekly_Main.Timesheet?cookie=${appCookie}`,
    { headers, validateStatus: () => true }
  );

  // Import and call the parser from current.ts
  // Re-implement inline to avoid circular import issues with the cheerio parsing
  const sheetHtml = sheetResp.data as string;

  const empIdMatch = sheetHtml.match(/vEmployeeID:\s*(\d+)/i);
  const jobMatch = sheetHtml.match(/GetHours\s*\(\d+,\s*\d+,\s*'([^']+)'\)/i);
  const employeeId = empIdMatch?.[1] ?? '';
  const jobCode = jobMatch?.[1] ?? '';

  // Parse day rows by finding nDate values near day names
  const dayRows = parseDayRowsFromHtml(sheetHtml);

  // Parse flags from first inputHours call in the HTML
  const flags = parseFlagsFromHtml(sheetHtml);

  return { appCookie, key, netId, year, month, periodLabel, employeeId, jobCode, flags, dayRows };
}

function parseDayRowsFromHtml(html: string) {
  const rows: Array<{
    dayName: string;
    nDate: string;
    isHoliday: string;
    hoursDisplay: string;
    dateLabel: string;
  }> = [];

  // Build isHoliday map from hidden inputs
  const holidayMap = new Map<string, string>();
  for (const m of html.matchAll(/id="isHoliday(\d+)"\s+value="([^"]+)"/gi)) {
    holidayMap.set(m[1], m[2]);
  }

  // Match each row: day name in <b>DAY ...</b> followed by GetHours(nDate, ...) onclick
  const rowPattern =
    /<tr[^>]*>.*?<b>(SUNDAY|MONDAY|TUESDAY|WEDNESDAY|THURSDAY|FRIDAY|SATURDAY)[^<]*<\/b>.*?GetHours\s*\((\d+),/gis;
  for (const m of html.matchAll(rowPattern)) {
    const raw = m[1];
    const dayName = raw.charAt(0) + raw.slice(1).toLowerCase();
    const nDate = m[2];
    rows.push({
      dayName,
      nDate,
      isHoliday: holidayMap.get(nDate) ?? 'N',
      hoursDisplay: '',
      dateLabel: '',
    });
  }

  return rows;
}

function parseFlagsFromHtml(html: string) {
  const jsVar = (name: string, def: string) =>
    html.match(new RegExp(`var ${name}\\s*=\\s*"([^"]+)"`, 'i'))?.[1] ?? def;

  return {
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
}
