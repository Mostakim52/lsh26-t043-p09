# ServiceDesk — Vehicle Service Due Predictor

Solution for **LofiStack Hackathon 2026 — P09**

## Project information

- **Team:** `t043`
- **Team ID:** `LSH26-T043`
- **Problem:** `P09 — Vehicle Service Due Predictor`
- **Live application:** <https://servicedeskt043.vercel.app>
- **Backend API:** <https://p09-backend.onrender.com/api/v1>
- **Demo video:** none supplied

> Judges will evaluate only the exact commit SHA entered in the Final Submission Form.

## Solution summary

ServiceDesk tracks a workshop's whole fleet against three kinds of service rules — fixed
dates (insurance, fitness), monthly intervals (engine oil, AC service) and distance run
(brake pads, tyres) — and tells the workshop exactly who to call today, in what order, and
why. Every due-date calculation, priority score, and completion reset happens on the
backend against a real Postgres database, so the numbers a workshop employee sees are
never guessed on the client. A second sign-in mode lets a vehicle owner check their own
car's status by license plate, with no account needed.

## Requirements

| Requirement | Status | Where to verify |
| --- | --- | --- |
| R1 — Create fleet (40+ vehicles, 25+ owners, 3 rule kinds each) | Complete | `backend/src/db/seed.ts`, `GET /api/v1/fleet` |
| R2 — Project next due date + status per item | Complete | `backend/src/engine/schedule.ts`, `GET /api/v1/vehicles` |
| R3 — Daily call list, priority-ranked with reasons | Complete | `backend/src/engine/callList.ts`, `GET /api/v1/call-list` |
| R4 — Vehicle page + record a completed service | Complete | `backend/src/api/services.ts`, `POST /api/v1/vehicles/:id/services` |

See `evaluation-manifest.json` for the evidence behind each status.

## How to test the application

1. Open <https://servicedeskt043.vercel.app>.
2. On the **Employee** tab, click either test account in the "Test accounts" panel to
   fill the login form, then sign in. You'll land on **Today**, the priority-ranked call
   list computed live by the backend.
3. Switch to **Vehicle owner**, type a plate from the fleet (e.g. `Dhaka Metro Ba 18-3510`
   — visible in the Fleet tab once signed in as an employee), and submit. You'll see that
   one vehicle's due-date schedule with no account needed.
4. As an employee, open any vehicle and record a service against a due item — its due
   date/odometer reset and the new record appears in its history immediately.

### Test or sample data

The database is seeded from the organizer-published `P09_vehicle_service_public.json`
fixture (case `PUB-01`): 27 owners, 42 vehicles, 165 service items, 99 past service
records. To reset it to that published state, run `npm run db:seed` in `backend/`
(destructive — wipes and reloads owners/vehicles/items/records) and
`npm run db:seed:users` to reset the two demo accounts.

## Run locally

### Requirements

- Node.js 20+
- A Postgres database (the deployed instance uses Supabase; any Postgres works)

### Setup

```bash
git clone https://github.com/Mostakim52/lsh26-t043-p09.git
cd lsh26-t043-p09

# Backend
cd backend
npm ci
cp .env.example .env        # fill in DATABASE_URL / DIRECT_URL
npx prisma migrate deploy
npm run db:seed
npm run db:seed:users
npm run build && npm run start   # http://localhost:4001/api/v1

# Frontend (separate terminal)
cd ../frontend
npm ci
cp .env.example .env
# set VITE_API_BASE_URL=http://localhost:4001/api/v1 in .env
npm run dev                       # http://localhost:5173
```

Do not include real passwords, tokens or API keys. `.env.example` in both `backend/`
and `frontend/` lists variable names only.

## Problem-solving approach

The frontend (built first, by Mostakim Hossain) already contained a complete, tested
reference implementation of every domain formula in `frontend/src/engine/*` — next-due
projection per rule kind, priority scoring, and completion resets — plus its own spec
(`engine.test.ts`). Rather than re-deriving those formulas, the backend copies them
byte-for-byte and passes the exact same spec (29/29 assertions), so frontend and backend
can never disagree on the math. Auth uses a Bearer token instead of cookies, which avoids
the cross-site cookie complexity that a frontend and backend on different domains would
otherwise hit. Testing combined the copied spec, 20 new backend route tests (mocked
Prisma), and repeated live HTTP checks against the actual production database —
including a full completion round-trip verified against real before/after row state.

## Technology used

- **Frontend:** React 19, Vite, TypeScript, Three.js (`@react-three/fiber`/`drei`) for the
  procedural car and key-fob models
- **Backend:** Node.js, Express, TypeScript, Zod validation
- **Database:** PostgreSQL via Prisma ORM, hosted on Supabase
- **Deployment:** Render (backend), Vercel (frontend)
- **Other material tools:** Vitest + Supertest (backend tests), bcryptjs (password hashing)

See [`LICENSES.md`](LICENSES.md) for third-party materials.

## Team contributions

| Registered member | GitHub username | Major contribution | Evidence |
| --- | --- | --- | --- |
| Mostakim Hossain | `Mostakim52` | Entire frontend: React/Vite/Three.js app, all pages, login screen, router, theme system, original Vercel deployment | `frontend/src`, commits `c864b12`, `482696c` |
| jahin-7 | `jahin-7` | Entire backend: Prisma schema, ported calculation engine, Bearer auth, all REST endpoints, anonymous plate-lookup feature, 49 backend tests, Render deployment, frontend auth wiring | `backend/src`, `frontend/src/components/LoginView.tsx`, `frontend/src/components/MyVehicleView.tsx`, commits `167d722`, `79732ab` |

Commit count alone does not represent contribution.

## AI usage

Claude Code (Anthropic) was used for the backend implementation, deployment work, and
the vehicle-owner plate-lookup feature. See `evaluation-manifest.json` and
`LICENSES.md` for what it helped with and how the output was verified (automated tests
plus live checks against the production database and a real browser session).

## Major design decisions

- **Bearer-token auth, not cookies:** the frontend and backend live on different domains
  (Vercel/Render), so an opaque Bearer token avoids SameSite/credentials-mode issues
  entirely.
- **Engine ported byte-for-byte:** `backend/src/engine/*` is a literal copy of
  `frontend/src/engine/*`, kept in sync deliberately rather than reimplemented, and
  proven identical by passing the frontend's own test suite unmodified.
- **Shared Supabase project, prefixed tables:** the team's other submitted problem uses
  the same free-tier Supabase project; every P09 table is Prisma-mapped with a `p09_`
  prefix so the two schemas can't collide.
- **Plate lookup redacts owner PII:** the anonymous vehicle-owner endpoint returns the
  owner's name but never their phone, area, or since-date — a plate is visible on the
  car itself, so the feature shouldn't turn that into a stranger's contact details.

## Known limitations

- The backend runs on Render's free tier, which spins down after inactivity; the first
  request after an idle period can take up to ~50 seconds.
- Only one of the 25 published fixture cases (`PUB-01`) is seeded as the live dataset;
  there's no admin UI to switch between cases.
- Offline/sample mode (frontend with no `VITE_API_BASE_URL`) renders the bundled static
  `fleet.json` snapshot rather than live data — a demo fallback only.
- The plate lookup does an exact, case/whitespace-normalized match; it doesn't fuzzy-match
  typos beyond that normalization.

## Repository records

- [`EVENT.md`](EVENT.md) — event start code and pre-event-material declaration
- [`evaluation-manifest.json`](evaluation-manifest.json) — structured judging evidence
- [`LICENSES.md`](LICENSES.md) — frameworks, libraries, templates and assets
