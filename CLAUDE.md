# CLAUDE.md

## Project Overview

TimesheetBot Web is a Vercel-hosted web app that automates UCR timesheet submission via direct HTTP — no browser automation required. It authenticates with UCR CAS (including Duo MFA), then makes POST requests directly to `timesheet.ucr.edu` to fill in and submit the biweekly timesheet.

This project mirrors the architecture of SRCGo-Web (`/home/simon/Desktop/Projects/SRCGo-Web`).

## Project Structure

```
/
├── CLAUDE.md
├── vercel.json              ← build + routing config for Vercel
├── package.json             ← root (shared backend deps)
├── tsconfig.json            ← backend tsconfig
├── backend/
│   └── server.ts            ← local Express dev server
├── api/
│   ├── auth/
│   │   ├── login.ts         POST /api/auth/login
│   │   └── session.ts       DELETE /api/auth/session (logout)
│   └── timesheet/
│       ├── current.ts       GET /api/timesheet/current
│       └── submit.ts        POST /api/timesheet/submit
└── frontend/                ← Vite + React + TypeScript + TailwindCSS
```

## Commands

```bash
# Install dependencies
npm install              # root (backend)
cd frontend && npm install

# Local development (run both concurrently)
npx tsx backend/server.ts   # backend API on :3000
cd frontend && npm run dev   # Vite dev server on :5173 (proxies /api → :3000)

# Build frontend
cd frontend && npm run build

# Deploy
vercel deploy
```

## Architecture

### Why a Backend is Required

The UCR CAS auth flow cannot run in the browser:
- CORS blocks cross-domain requests to UCR/auth endpoints
- Cookie handling across multiple domains requires a server-side cookie jar
- Duo MFA requires intercepting server-side redirects

### Auth Flow

1. GET `https://timesheet.ucr.edu/` — initialize session
2. GET `https://auth.ucr.edu/cas/login?service=<timesheet-url>` — extract `execution` token
3. POST `https://auth.ucr.edu/cas/login` — submit credentials; CAS redirects to Duo
4. **TODO (Phase 0)**: Handle Duo MFA challenge — poll Duo API until user approves push
5. Follow Duo redirect back to CAS → CAS redirects to timesheet.ucr.edu with service ticket
6. Timesheet server validates ticket → returns authenticated `JSESSIONID` cookie
7. Backend stores `JSESSIONID` in httpOnly `ts_session` cookie

### Session Management

- Backend sets an httpOnly cookie `ts_session` containing the JSESSIONID
- Frontend never sees the token (XSS-safe)
- On expiry, user is redirected to login

### Timesheet Submission

**TODO (Phase 0)**: Run `timesheet_bot.py` with network logging to capture:
- The endpoint for fetching the current timesheet (day rows, hidden fields)
- The POST endpoint for adding time entries per day
- The POST endpoint for the final Save

Until Phase 0 is complete, `api/timesheet/current.ts` and `api/timesheet/submit.ts` return 501.

## Design System

Colors, spacing, and typography match SRCGo-Web's Tailwind tokens exactly. See `frontend/tailwind.config.ts`.

## Key Dependencies

- **Backend**: `axios`, `axios-cookiejar-support`, `tough-cookie`, `cookie`
- **Frontend**: `react`, `react-router-dom`, `tailwindcss`, `vite`
