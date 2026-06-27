import type { VercelRequest, VercelResponse } from '@vercel/node';

// Allows Chrome/Firefox extension origins. Same-origin web app requests
// don't need CORS headers — the browser handles those automatically.
export function applyCors(req: VercelRequest, res: VercelResponse): boolean {
  const origin = req.headers.origin ?? '';
  if (origin.startsWith('chrome-extension://') || origin.startsWith('moz-extension://')) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  }
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return true;
  }
  return false;
}
