import type { VercelRequest, VercelResponse } from '@vercel/node';
import { parse as parseCookies } from 'cookie';
import { applyCors } from './_cors';
import { parseSession } from './auth/login';

async function getKv() {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  const { Redis } = await import('@upstash/redis');
  return new Redis({ url, token });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (applyCors(req, res)) return;

  const cookies = parseCookies(req.headers.cookie ?? '');
  if (!cookies['ts_session']) return res.status(401).json({ error: 'SESSION_EXPIRED' });

  let username: string;
  try {
    ({ username } = parseSession(cookies['ts_session']));
  } catch {
    return res.status(401).json({ error: 'SESSION_EXPIRED' });
  }

  const key = `schedule:${username}`;
  const kv = await getKv();

  if (req.method === 'GET') {
    if (!kv) return res.status(200).json({ schedule: null });
    try {
      const schedule = await kv.get(key);
      return res.status(200).json({ schedule: schedule ?? null });
    } catch {
      return res.status(200).json({ schedule: null });
    }
  }

  if (req.method === 'POST') {
    const { schedule } = (req.body ?? {}) as { schedule?: unknown };
    if (!schedule) return res.status(400).json({ error: 'schedule required' });
    if (!kv) return res.status(200).json({ success: true, stored: false });
    try {
      await kv.set(key, schedule);
      return res.status(200).json({ success: true, stored: true });
    } catch {
      return res.status(200).json({ success: true, stored: false });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
