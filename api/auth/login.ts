import type { VercelRequest, VercelResponse } from '@vercel/node';
import axios from 'axios';
import { applyCors } from '../_cors';
import { wrapper } from 'axios-cookiejar-support';
import { CookieJar } from 'tough-cookie';

const TIMESHEET_BASE = 'https://timesheet.ucr.edu/timesheet2';
const CAS_LOGIN = 'https://auth.ucr.edu/cas/login';
// CAS redirects back here after auth — extracted from the 302 Location when hitting timesheet unauthenticated
const CAS_SERVICE_URL = `${TIMESHEET_BASE}/TIMESHEET_MAIN.MAIN_CAS`;

interface TimesheetSession {
  appCookie: string; // APEX session ID passed as ?cookie= param on every request
  cookieHeader: string; // serialized HTTP cookies from the auth flow
  username: string;
}

function buildSessionCookie(value: string): string {
  const secure = process.env.VERCEL ? '; Secure' : '';
  return [
    `ts_session=${value}`,
    'HttpOnly',
    `SameSite=Strict${secure}`,
    'Path=/api',
    'Max-Age=43200',
  ].join('; ');
}

export function parseSession(raw: string): TimesheetSession {
  return JSON.parse(Buffer.from(raw, 'base64').toString('utf-8')) as TimesheetSession;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (applyCors(req, res)) return;
  if (req.method !== 'POST')
    return res.status(405).json({ success: false, error: 'Method not allowed' });

  const { username, password } = (req.body ?? {}) as { username?: string; password?: string };
  if (!username || !password) {
    return res.status(400).json({ success: false, error: 'Username and password are required' });
  }

  const jar = new CookieJar();
  const client = wrapper(
    axios.create({
      jar,
      withCredentials: true,
      timeout: 60_000,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-us',
      },
    })
  );

  try {
    // Step 1: Hit timesheet root — server 302s to CAS with the service URL
    await client.get(`${TIMESHEET_BASE}/TIMESHEET_MAIN.MAIN_CAS`, {
      maxRedirects: 0,
      validateStatus: () => true,
    });

    // Step 2: Get CAS login page and extract execution token
    const casUrl = `${CAS_LOGIN}?service=${encodeURIComponent(CAS_SERVICE_URL)}`;
    const casPage = await client.get<string>(casUrl, {
      headers: { Referer: TIMESHEET_BASE },
    });

    const match = (casPage.data as string).match(/name="execution" value="([^"]+)"/);
    if (!match) {
      return res.status(503).json({ success: false, error: 'Authentication service unavailable' });
    }
    const execution = match[1];

    // Step 3: Submit credentials to CAS
    const params = new URLSearchParams({
      username,
      password,
      execution,
      _eventId: 'submit',
      geolocation: '',
    });
    const submitResp = await client.post<string>(casUrl, params.toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Origin: 'https://auth.ucr.edu',
        Referer: casUrl,
      },
      maxRedirects: 0,
      validateStatus: () => true,
    });

    // 200 = CAS error page (bad credentials or Duo challenge in-page)
    if (submitResp.status === 200) {
      const html = submitResp.data as string;
      if (
        html.includes('credentials you provided cannot be determined') ||
        html.includes('Authentication failed') ||
        html.includes('Incorrect username or password')
      ) {
        return res.status(401).json({ success: false, error: 'Invalid username or password' });
      }
      return res.status(503).json({ success: false, error: 'Unexpected CAS response' });
    }

    if (submitResp.status !== 302) {
      return res.status(401).json({ success: false, error: 'Invalid username or password' });
    }

    const redirectLocation = submitResp.headers['location'] as string | undefined;
    if (!redirectLocation) {
      return res.status(502).json({ success: false, error: 'Missing redirect from CAS' });
    }

    // Step 4: Duo intercepts here — CAS 302s to Duo before issuing the service ticket.
    // Duo redirects back to CAS as:
    //   https://auth.ucr.edu/cas/login?state=...&duo_code=...
    // We follow all redirects from this point; Playwright handled Duo in the browser.
    // In the HTTP flow the user must approve Duo — follow the chain after approval lands back at CAS.
    // TODO: For fully headless Duo handling, capture Duo network traffic and implement
    //   the push-poll loop (POST to Duo frame API → poll status → POST sig_response back to CAS).
    //   For now we follow redirects and rely on the browser to have approved the push
    //   if called from the Playwright-based auth session capture flow.
    const afterDuoResp = await client.get(redirectLocation, {
      maxRedirects: 10,
      validateStatus: () => true,
    });

    const finalHtml = afterDuoResp.data as string;

    // Step 5: Extract the APEX session ID ("cookie" param) from the HTML.
    // After CAS validation, the timesheet server creates an APEX session and embeds
    // it in every link as ?cookie=XXXXXX. Grab the first occurrence.
    const appCookieMatch = finalHtml.match(/[?&]cookie=(\d+)/);
    if (!appCookieMatch) {
      // Might still be on Duo page if push not yet approved
      if (finalHtml.toLowerCase().includes('duo') || finalHtml.toLowerCase().includes('approve')) {
        return res.status(503).json({
          success: false,
          error: 'Duo MFA pending. Approve the push on your phone and try signing in again.',
        });
      }
      console.error('[login] No appCookie in HTML. Status:', afterDuoResp.status);
      return res
        .status(502)
        .json({ success: false, error: 'Could not establish timesheet session' });
    }
    const appCookie = appCookieMatch[1];

    // Serialize HTTP cookies from the jar for use in subsequent requests
    const jarCookies = jar.toJSON().cookies as Array<{ key: string; value: string }>;
    const cookieHeader = jarCookies.map((c) => `${c.key}=${c.value}`).join('; ');

    const session: TimesheetSession = { appCookie, cookieHeader, username: username.toUpperCase() };
    const sessionValue = Buffer.from(JSON.stringify(session)).toString('base64');

    res.setHeader('Set-Cookie', buildSessionCookie(sessionValue));
    return res.status(200).json({ success: true, username });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[login] error:', message);

    if (message.includes('timeout') || message.includes('ECONNREFUSED')) {
      return res.status(503).json({ success: false, error: 'Network error. Please try again.' });
    }
    return res.status(500).json({ success: false, error: 'An unexpected error occurred' });
  }
}
