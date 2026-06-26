import type { VercelRequest, VercelResponse } from "@vercel/node";
import axios from "axios";
import { applyCors } from "../_cors";
import * as cheerio from "cheerio";
import { parse as parseCookies } from "cookie";
import { parseSession } from "../auth/login";

const BASE = "https://timesheet.ucr.edu/timesheet2";

export interface TimesheetInfo {
  appCookie: string;
  key: string; // timesheet ID (e.g. "1298141")
  netId: string; // e.g. "SCUN002"
  year: string; // v_year param
  month: string; // v_month param
  periodLabel: string; // e.g. "Jun 1 - Jun 14"
  employeeId: string; // vEmployeeID
  jobCode: string; // vJob (URL-decoded)
  flags: EmployeeFlags;
  dayRows: DayRow[]; // all clickable rows on the biweekly sheet
}

export interface EmployeeFlags {
  vHasSKL: string;
  vHasVAC: string;
  vHasCTA: string;
  vHasPTO: string;
  vHasHun: string;
  vOvertime: string;
  vEmployeeType: string;
  vOnLeave: string;
  vCurtailmentPeriod: string;
  vIsGSR: string;
  vIsASE: string;
}

export interface DayRow {
  dayName: string; // "Monday", "Wednesday", etc.
  nDate: string; // period index ("1"–"14")
  isHoliday: string; // "Y" | "N"
  hoursDisplay: string; // e.g. "5:00PM-7:00PM" or "" if nothing saved
  dateLabel: string; // e.g. "Jun 16"
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (applyCors(req, res)) return;
  if (req.method !== "GET")
    return res.status(405).json({ error: "Method not allowed" });

  const cookies = parseCookies(req.headers.cookie ?? "");
  if (!cookies["ts_session"])
    return res.status(401).json({ error: "SESSION_EXPIRED" });

  let session: ReturnType<typeof parseSession>;
  try {
    session = parseSession(cookies["ts_session"]);
  } catch {
    return res.status(401).json({ error: "SESSION_EXPIRED" });
  }

  const { appCookie, cookieHeader, username } = session;
  const headers = {
    Cookie: cookieHeader,
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
  };

  try {
    // Step 1: Fetch the timesheet list page
    const listResp = await axios.get<string>(
      `${BASE}/TIMESHEET_MAIN.VIEW_USER_TIMESHEET_LIST?cookie=${appCookie}`,
      { headers, validateStatus: () => true },
    );

    const listHtml = listResp.data as string;
    if (
      listResp.status === 302 ||
      listHtml.toLowerCase().includes("cas/login") ||
      listHtml.toLowerCase().includes("invalid_cookie")
    ) {
      return res.status(401).json({ error: "SESSION_EXPIRED" });
    }

    // Step 2: Parse the current timesheet link — the one with " - " date range text
    const info = parseTimesheetListLink(listHtml, appCookie, username);
    if (!info) {
      return res.status(401).json({ error: "SESSION_EXPIRED" });
    }

    // Step 3: Select the timesheet — params go in URL query string, POST body is empty
    const updateParams = new URLSearchParams({
      cookie: appCookie,
      v_user_netid: info.netId,
      v_timesheet_id: info.key,
      v_year: info.year,
      v_month: info.month,
      v_style_hour: "8",
      v_style_code: "1",
      v_type: "USER",
    });
    await axios.post(
      `${BASE}/TIMESHEET_MAIN.update_cookie_User_list?${updateParams}`,
      null,
      { headers, validateStatus: () => true },
    );

    // Step 4: Load the biweekly timesheet (302 → final page)
    await axios.get(
      `${BASE}/Timesheet_biweekly_main.LoadTimesheet?cookie=${appCookie}`,
      {
        headers,
        maxRedirects: 5,
        validateStatus: () => true,
      },
    );

    const sheetResp = await axios.get<string>(
      `${BASE}/Timesheet_BiWeekly_Main.Timesheet?cookie=${appCookie}`,
      { headers, validateStatus: () => true },
    );

    // Step 5: Parse day rows and employee params from the biweekly sheet
    const sheetHtml = sheetResp.data as string;

    const { dayRows, employeeId, jobCode, flags } = parseSheetRows(sheetHtml);

    const result: TimesheetInfo = {
      ...info,
      employeeId,
      jobCode,
      flags,
      dayRows,
    };

    return res.status(200).json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[timesheet/current] error:", message);
    if (
      axios.isAxiosError(err) &&
      (err.response?.status === 401 || err.response?.status === 403)
    ) {
      return res.status(401).json({ error: "SESSION_EXPIRED" });
    }
    return res.status(502).json({ error: "Failed to fetch timesheet" });
  }
}

// Parse the "current timesheet" link from the list page.
// The page uses JS: go_biweekly_timesheet('SCUN002', 1298141, 0, 351, 8, 1)
// args: netId, timesheet_id, year, month, style_hour, style_code
function parseTimesheetListLink(
  html: string,
  appCookie: string,
  username: string,
): Omit<TimesheetInfo, "employeeId" | "jobCode" | "flags" | "dayRows"> | null {
  const callMatch = html.match(
    /go_biweekly_timesheet\s*\(\s*['"]([^'"]+)['"]\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i,
  );
  if (!callMatch) return null;

  const netId = callMatch[1]; // 'SCUN002'
  const key = callMatch[2]; // '1298141'
  const year = callMatch[3]; // '0'
  const month = callMatch[4]; // '351'

  // Extract the date range label from the bold text near that link
  const labelMatch =
    html.match(/<B>([^<]*\d{4}[^<]*-[^<]*\d{4}[^<]*)<\/B>/i) ??
    html.match(/<b>([A-Za-z]+ \d+,? \d{4}[^<]+-[^<]+)<\/b>/i);
  const periodLabel = labelMatch ? labelMatch[1].trim() : "Current period";

  return {
    appCookie,
    key,
    netId: netId || username,
    year,
    month,
    periodLabel,
  };
}

// Extract the displayed hours for a given nDate from the raw HTML.
// Looks for <span id="Job-JOBCODE-N">TEXT</span> (the current_span).
// Cheerio can't reliably traverse these rows because <input> is placed directly
// inside <tr> before any <td>, which htmlparser2 foster-parents out of the row.
function extractHoursDisplay(html: string, nDate: string): string {
  // Target specifically <span class="current_span" id="Job-JOBCODE-N">
  // Avoids matching the sibling <span id="Job-0-N"> (total hours number)
  const m = html.match(
    new RegExp(
      `<span[^>]+class="current_span"[^>]+id="[^"]*-${nDate}"[^>]*>([\\s\\S]*?)<\\/span>`,
      "i",
    ),
  );
  if (!m) return "";
  const text = m[1]
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return /click to add/i.test(text) ? "" : text;
}

// Parse day rows and employee params from the biweekly timesheet page.
// The page uses GetHours(nDate, key, jobCode) onclick handlers on <td class="job1"> cells.
// Employee flags are declared as JS vars (var sHasSKL = "Y") at the top of the script.
// isHoliday per day is in a hidden input: <input type=hidden id="isHolidayN" value="Y/N">
function parseSheetRows(html: string): {
  dayRows: DayRow[];
  employeeId: string;
  jobCode: string;
  flags: EmployeeFlags;
} {
  const dayRows: DayRow[] = [];

  // Extract employee ID from the params block
  const empIdMatch = html.match(/vEmployeeID:\s*(\d+)/i);
  const employeeId = empIdMatch?.[1] ?? "";

  // Extract job code from GetHours(..., '41207979:0:D01003') — first occurrence
  const jobMatch = html.match(/GetHours\s*\(\d+,\s*\d+,\s*'([^']+)'\)/i);
  const jobCode = jobMatch?.[1] ?? "";

  // Extract flags from JS var declarations
  const jsVar = (name: string, def: string) =>
    html.match(new RegExp(`var ${name}\\s*=\\s*"([^"]+)"`, "i"))?.[1] ?? def;
  const flags: EmployeeFlags = {
    vHasSKL: jsVar("sHasSKL", "N"),
    vHasVAC: jsVar("sHasVAC", "N"),
    vHasCTA: jsVar("sHasCTA", "N"),
    vHasPTO: jsVar("sHasPTO", "N"),
    vHasHun: jsVar("sHasHUN", "N"),
    vOvertime: jsVar("sOvertime", "N"),
    vEmployeeType: jsVar("sEmployeeType", "BX"),
    vOnLeave: "N",
    vCurtailmentPeriod: "N",
    vIsGSR: "N",
    vIsASE: "Y",
  };

  // Extract isHoliday values per nDate from hidden inputs
  const holidayMap = new Map<string, string>();
  for (const m of html.matchAll(/id="isHoliday(\d+)"\s+value="([^"]+)"/gi)) {
    holidayMap.set(m[1], m[2]);
  }

  // Parse day rows: each <tr> has a day name in <b>MONDAY JUN 22nd...</b>
  // and a <td class="job1" onClick="GetHours(nDate, key, 'jobCode');">
  const $ = cheerio.load(html);
  $("tr").each((_, row) => {
    const boldText = $(row).find("td.dayOfMonth b").text().trim();
    if (!boldText) return;

    const dayNameMatch = boldText.match(
      /^(SUNDAY|MONDAY|TUESDAY|WEDNESDAY|THURSDAY|FRIDAY|SATURDAY)/i,
    );
    if (!dayNameMatch) return;
    const dayName =
      dayNameMatch[1].charAt(0) + dayNameMatch[1].slice(1).toLowerCase();

    const onclick = $(row).find("td.job1").attr("onclick") ?? "";
    const ghMatch = onclick.match(/GetHours\s*\((\d+),/i);
    if (!ghMatch) return;

    const nDate = ghMatch[1];
    const isHoliday = holidayMap.get(nDate) ?? "N";
    // Read hours directly from the raw HTML via the current_span id (cheerio
    // misparses the malformed <input> placed directly inside <tr> before any <td>)
    const hoursDisplay = extractHoursDisplay(html, nDate);
    // boldText e.g. "MONDAY JUN 16TH" → "Jun 16"
    const dateMatch = boldText
      .slice(dayNameMatch[1].length)
      .trim()
      .match(/([A-Z]+)\s+(\d+)/i);
    const dateLabel = dateMatch
      ? `${dateMatch[1].charAt(0).toUpperCase() + dateMatch[1].slice(1).toLowerCase()} ${parseInt(dateMatch[2], 10)}`
      : "";
    dayRows.push({ dayName, nDate, isHoliday, hoursDisplay, dateLabel });
  });

  return { dayRows, employeeId, jobCode, flags };
}
