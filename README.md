# UCR Timesheet

Automates UCR biweekly timesheet submission. Set your weekly schedule once — the app fills in every matching day of the current pay period and saves it with one click.

## How it works

Two parts work together:

1. **Web app** (this repo) — a React frontend + serverless API deployed on Vercel. Handles the UCR timesheet UI, schedule storage, and direct HTTP calls to `timesheet.ucr.edu`.
2. **Chrome extension** ([separate repo](../extension)) — detects when you visit `timesheet.ucr.edu`, captures your session, and imports it into the web app automatically. No manual login required.

### Auth flow

The extension captures your APEX session cookie when you visit UCR's timesheet portal (after you log in with CAS + Duo). It then calls `/api/auth/import-session` to transfer that session to the web app. Your schedule is stored in Upstash Redis keyed to your UCR NetID.

## Setup

```bash
# Install dependencies
make setup

# Start local dev servers (backend :3000, frontend :5173)
make dev
```

The frontend proxies `/api/*` to the backend, so everything runs as if it were one server.

## Commands

| Command | Description |
|---|---|
| `make setup` | Install root + frontend dependencies |
| `make dev` | Start backend (tsx watch) + frontend (Vite) concurrently |
| `make lint` | ESLint for backend and frontend |
| `make format` | Prettier format backend and frontend source |
| `make check` | Type-check backend + build frontend (mirrors CI) |

## Deployment

Deployed automatically on push to `master` via Vercel GitHub integration.

**Required environment variables** (set in Vercel dashboard):

| Variable | Description |
|---|---|
| `KV_REST_API_URL` | Upstash Redis REST URL (auto-injected by Vercel integration) |
| `KV_REST_API_TOKEN` | Upstash Redis token (auto-injected by Vercel integration) |

## Project structure

```
api/
├── _cors.ts              shared CORS helper (extension origins)
├── schedule.ts           GET/POST user schedule (Upstash Redis)
├── auth/
│   ├── login.ts          CAS login with Duo MFA
│   ├── import-session.ts session import from extension
│   └── session.ts        logout
└── timesheet/
    ├── current.ts        fetch current biweekly period + day rows
    ├── day.ts            read/write hours for a single day
    ├── save.ts           bulk save from weekly schedule
    └── parse.ts          parse raw UCR HTML (called by extension)
frontend/src/
├── pages/                LoginPage, TimesheetPage, SettingsPage
├── context/              AuthContext, SettingsContext (schedule + KV sync)
├── hooks/                useTimesheet
└── components/           Button, Card, Input, Switch, Sidebar, BottomNav
```

## CI

GitHub Actions runs on every push and PR:

1. ESLint — backend and frontend
2. TypeScript type-check — backend
3. Frontend build — includes `tsc` + Vite bundle

Pre-commit hooks (Husky + lint-staged) run Prettier and ESLint on staged files before every commit.
