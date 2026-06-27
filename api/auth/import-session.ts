import type { VercelRequest, VercelResponse } from '@vercel/node';
import { applyCors } from '../_cors';

interface ImportPayload {
  appCookie: string; // the number from ?cookie=XXXXXX in the URL
  cookies: string; // raw "name=value; name2=value2" string from Playwright
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

export default function handler(req: VercelRequest, res: VercelResponse) {
  if (applyCors(req, res)) return;
  if (req.method !== 'POST')
    return res.status(405).json({ success: false, error: 'Method not allowed' });

  const { appCookie, cookies, username } = (req.body ?? {}) as Partial<ImportPayload>;

  if (!appCookie || !username) {
    return res.status(400).json({ success: false, error: 'appCookie and username are required' });
  }

  if (!/^\d+$/.test(appCookie.trim())) {
    return res
      .status(400)
      .json({ success: false, error: 'appCookie must be a numeric session ID' });
  }

  const session = {
    appCookie: appCookie.trim(),
    cookieHeader: (cookies ?? '').trim(),
    username: username.trim().toUpperCase(),
  };

  const sessionValue = Buffer.from(JSON.stringify(session)).toString('base64');

  res.setHeader('Set-Cookie', buildSessionCookie(sessionValue));
  return res.status(200).json({ success: true, username: session.username });
}
