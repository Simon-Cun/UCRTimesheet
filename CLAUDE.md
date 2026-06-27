# CLAUDE.md

## Project Overview

UCR Timesheet is a two-part system:

1. **Web app** (`application/`) — Vercel-hosted React + TypeScript frontend with serverless API routes. Authenticates with UCR CAS (including Duo MFA) and makes direct HTTP requests to `timesheet.ucr.edu` to read and write timesheet hours.
2. **Chrome extension** (`../extension/`) — Captures the UCR APEX session cookie from the browser and syncs it to the web app. Also drives timesheet save operations from inside the UCR tab via `chrome.scripting.executeScript`.

Deployed at: `https://ucrtimesheet.vercel.app`

## Repository Layout

This is a monorepo with two separate git repos:

```
ucr-timesheet/
├── application/         ← web app repo (pushed to GitHub → Vercel)
│   ├── CLAUDE.md
│   ├── vercel.json
│   ├── package.json     ← backend deps
│   ├── tsconfig.json
│   ├── Makefile
│   ├── backend/
│   │   └── server.ts    ← local Express dev server
│   ├── api/
│   │   ├── _cors.ts     ← shared CORS preflight helper
│   │   ├── schedule.ts  ← GET/POST /api/schedule (Upstash Redis)
│   │   ├── auth/
│   │   │   ├── login.ts          POST /api/auth/login
│   │   │   ├── import-session.ts POST /api/auth/import-session
│   │   │   └── session.ts        DELETE /api/auth/session (logout)
│   │   └── timesheet/
│   │       ├── current.ts  GET /api/timesheet/current
│   │       ├── day.ts      GET/POST /api/timesheet/day
│   │       ├── save.ts     POST /api/timesheet/save
│   │       └── parse.ts    POST /api/timesheet/parse
│   └── frontend/        ← Vite + React + TypeScript + TailwindCSS
│       └── src/
│           ├── pages/   LoginPage, TimesheetPage, SettingsPage
│           ├── context/ AuthContext, SettingsContext
│           ├── hooks/   useTimesheet
│           ├── components/ui/  Button, Card, Input, Switch
│           └── components/layout/  Sidebar, BottomNav
└── extension/           ← Chrome extension repo (separate git)
    ├── manifest.json    ← MV3, targets timesheet.ucr.edu + ucrtimesheet.vercel.app
    ├── background.js    ← service worker: session capture, scripting, cache
    ├── content.js       ← runs on timesheet.ucr.edu: extracts appCookie + pages
    ├── app-bridge.js    ← runs on app origin (ISOLATED world): relays messages
    ├── app-bridge-main.js ← runs on app origin (MAIN world): receives from bridge
    ├── popup.html/js    ← extension popup UI with App URL config field
    └── icons/
```

## Commands

```bash
# Install dependencies
npm install              # root (backend)
cd frontend && npm install

# Local development (run both)
npx tsx backend/server.ts   # backend API on :3000
cd frontend && npm run dev   # Vite dev server on :5173 (proxies /api → :3000)

# Build frontend
cd frontend && npm run build

# Deploy (auto-deploys on push to master via Vercel GitHub integration)
git push
```

## Architecture

### Why a Backend is Required

- CORS blocks cross-domain requests to UCR/auth endpoints from the browser
- Cookie handling across multiple domains requires a server-side cookie jar
- Duo MFA requires intercepting server-side redirects

### Auth Flow — CAS Login (`POST /api/auth/login`)

1. GET `https://timesheet.ucr.edu/timesheet2/TIMESHEET_MAIN.MAIN_CAS` — initialize
2. GET `https://auth.ucr.edu/cas/login?service=<url>` — extract `execution` token
3. POST CAS credentials — CAS 302s toward Duo
4. Follow Duo redirect chain (user must approve push on phone); land back at timesheet
5. Extract `?cookie=XXXXXX` (APEX session ID) from final HTML
6. Serialize cookie jar → base64 → store as httpOnly `ts_session` cookie (`Path=/api`)

### Auth Flow — Extension Import (`POST /api/auth/import-session`)

The Chrome extension captures `appCookie` and raw `Cookie` header directly from the browser (no Duo required since the user already completed MFA). POSTs them to `/api/auth/import-session` which sets the same `ts_session` cookie. This is the primary auth path used in practice.

### Session Format

`ts_session` = base64(JSON({ appCookie, cookieHeader, username }))

- `appCookie`: numeric APEX session ID passed as `?cookie=N` on every UCR request
- `cookieHeader`: serialized HTTP cookies from the auth flow
- `username`: UCR NetID (uppercase, e.g. `SCUN002`)

### Schedule Storage — Upstash Redis

`GET/POST /api/schedule` stores the user's weekly schedule per username.

- Key: `schedule:<USERNAME>`
- Env vars: `KV_REST_API_URL`, `KV_REST_API_TOKEN` (injected by Vercel Upstash integration)
- Gracefully returns `null` if KV is unavailable (falls back to localStorage in frontend)

### Timesheet API Endpoints

| Endpoint | Method | Description |
|---|---|---|
| `/api/timesheet/current` | GET | Fetches the current biweekly timesheet; returns `TimesheetInfo` with `dayRows`, `employeeId`, `jobCode`, `flags` |
| `/api/timesheet/day` | GET | Fetches existing time entries for one `nDate` |
| `/api/timesheet/day` | POST | Saves/clears time entries for one `nDate` |
| `/api/timesheet/save` | POST | Saves all days from a weekly schedule in one call |
| `/api/timesheet/parse` | POST | Parses raw HTML pages (used by extension to avoid re-fetching) |

UCR timesheet uses an APEX server. Each day POST requires: `SaveTimesheetHours` → `DisplayTimesheetMessages` → `savetimesheet` in sequence.

### Chrome Extension Flow

1. `content.js` runs on `timesheet.ucr.edu` — detects `?cookie=N` in the URL, extracts it plus the list/sheet HTML, and sends `SESSION_CAPTURED` + `TIMESHEET_PAGES_FETCHED` to `background.js`
2. `background.js` (service worker) receives the session, stores it in `chrome.storage.local`, and calls `POST /api/auth/import-session` on the app
3. App opens/focuses in existing tab with session pre-loaded
4. For Save operations, `background.js` uses `chrome.scripting.executeScript` to inject fetch calls directly into a UCR tab — this bypasses CORS since the fetch runs in the UCR origin context

### Extension — App URL Config

The popup has an "App URL" field stored in `chrome.storage.local`. Default: `https://ucrtimesheet.vercel.app`. Users can override to `http://localhost:8000` for local dev.

## Key Dependencies

- **Backend**: `axios`, `axios-cookiejar-support`, `tough-cookie`, `cheerio`, `cookie`, `@upstash/redis`
- **Frontend**: `react`, `react-router-dom`, `tailwindcss`, `vite`
- **Extension**: MV3 service worker, `chrome.scripting`, `chrome.storage`

## Design System

Colors, spacing, and typography use Tailwind custom tokens defined in `frontend/tailwind.config.ts`. Semantic colors: `primary-blue`, `neutral-gray*`, `semantic-success`, `semantic-error`.
