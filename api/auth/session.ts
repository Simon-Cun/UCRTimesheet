import type { VercelRequest, VercelResponse } from '@vercel/node';
import { parse as parseCookies } from 'cookie';
import { applyCors } from '../_cors';
import { parseSession } from './login';

export default function handler(req: VercelRequest, res: VercelResponse) {
  if (applyCors(req, res)) return;

  if (req.method === 'GET') {
    const cookies = parseCookies(req.headers.cookie ?? '');
    if (!cookies['ts_session']) return res.status(200).json({ isAuthenticated: false });
    try {
      const { username } = parseSession(cookies['ts_session']);
      return res.status(200).json({ isAuthenticated: true, username });
    } catch {
      return res.status(200).json({ isAuthenticated: false });
    }
  }

  if (req.method === 'DELETE') {
    res.setHeader('Set-Cookie', 'ts_session=; HttpOnly; SameSite=Strict; Path=/api; Max-Age=0');
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
