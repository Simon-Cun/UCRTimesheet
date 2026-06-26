import cors from 'cors';
import express from 'express';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import loginHandler from '@api/auth/login';
import sessionHandler from '@api/auth/session';
import importSessionHandler from '@api/auth/import-session';
import currentHandler from '@api/timesheet/current';
import saveHandler from '@api/timesheet/save';
import dayHandler from '@api/timesheet/day';
import scheduleHandler from '@api/schedule';

const app = express();

app.use(express.json());

app.use(
  cors({
    origin: (origin, cb) => {
      // Allow local frontend, browser extensions, and no-origin requests
      if (
        !origin ||
        origin === 'http://localhost:8000' ||
        origin.startsWith('chrome-extension://') ||
        origin.startsWith('moz-extension://')
      ) {
        cb(null, origin ?? true);
      } else {
        cb(null, origin); // permissive in dev — lock down in prod
      }
    },
    credentials: true,
  })
);

type VercelHandler = (req: VercelRequest, res: VercelResponse) => unknown;
function adapt(handler: VercelHandler): express.RequestHandler {
  return (req, res) => handler(req as unknown as VercelRequest, res as unknown as VercelResponse);
}

app.post('/api/auth/login', adapt(loginHandler));
app.post('/api/auth/import-session', adapt(importSessionHandler));
app.get('/api/auth/session', adapt(sessionHandler));
app.delete('/api/auth/session', adapt(sessionHandler));
app.get('/api/timesheet/current', adapt(currentHandler));
app.post('/api/timesheet/save', adapt(saveHandler));
app.get('/api/timesheet/day', adapt(dayHandler));
app.post('/api/timesheet/day', adapt(dayHandler));
app.get('/api/schedule', adapt(scheduleHandler));
app.post('/api/schedule', adapt(scheduleHandler));
app.options('*', (_, res) => res.sendStatus(204));

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
});
