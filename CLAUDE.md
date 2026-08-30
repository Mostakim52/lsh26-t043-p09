# CLAUDE.md — P09 Vehicle Service Due Predictor — Frontend ↔ Backend Contract

> **For backend developer.** The frontend is `frontend/` (React + Vite + Three.js). Every piece of derived information **must come from the backend** — the frontend never computes due dates, statuses, call-list ranking or post-service resets. When `VITE_API_BASE_URL` is set, the app fetches everything from `BASE`. When empty it falls back to `public/data/fleet.json` + the local `src/engine/*` (offline demo only). Ship with `BASE` set.

---

## 1) What the product does (the 4 required items)

1. **Create fleet** — >=40 vehicles across >=25 owners. Each vehicle has 3–5+ service items each carrying exactly one rule (fixedDate | interval | distance), a current odometer reading and past service records.
2. **Project next due** — For every item compute `nextDueDate` using its own rule. For distance items estimate a date from `avgKmPerDay`. Classify each as `overdue | dueSoon | fine`.
3. **Daily call list** — Workshop sees which owner/vehicle/items to call today, sorted so most overdue + highest-value work is first, with a human-readable `why` per row.
4. **Vehicle page + completion** — Owner's vehicle page shows every item with next due date + cost. Workshop can record a completed service → that item's rule resets and service history grows.

---

## 2) Architecture rule

```
Frontend = renderer only. Backend = calculator + store.
```

- Frontend never imports `src/engine/schedule.ts | callList.ts | complete.ts` when `backendConfigured === true`. It renders JSON the backend returned.
- Backend owns all date maths, distance projection, status classification, priority scoring, and completion resets. See §4–§6 for exact formulas — implement them byte-identically so tests pass.
- `src/engine/*` stays in the repo as the offline fallback and as the **reference implementation** for the backend. `src/engine/engine.test.ts` is the spec; backend must pass the same assertions.

---

## 3) Data model (raw storage)

### 3.1 Owner
```json
{ "id": "OWN-001", "name": "Sultana Ahmed", "phone": "01745585320", "area": "Lalmatia", "since": "2020-04-09" }
```

### 3.2 Vehicle
```json
{
  "id": "VEH-001",
  "ownerId": "OWN-008",
  "make": "Honda", "model": "Vezel", "year": 2022,
  "plate": "DHAKA METRO-GHA 36-9009",
  "colour": "#8C8F94",
  "bodyType": "sedan|hatchback|suv|mpv",
  "odometer": { "km": 89299, "readAt": "2026-08-04" },
  "avgKmPerDay": 66,
  "items": [ ServiceItem, ... ]
}
```
- `odometer.readAt` + `avgKmPerDay` → projected odometer today (see §4.3). `avgKmPerDay >= 0`; if 0, clamp to 1 in formulas.
- `bodyType` + `colour` drive the 3D model (`src/three/CarModel.tsx`). Do not rename colours; they are CSS hex.

### 3.3 ServiceItem (exactly one rule)

```ts
type ServiceRule =
  | { kind: "fixedDate";  dueDate: IsoDate; renewalMonths: number }   // Insurance, fitness, tax token
  | { kind: "interval";   months: number; lastDoneDate: IsoDate }     // Engine oil, coolant, AC
  | { kind: "distance";   intervalKm: number; lastDoneOdometer: number; lastDoneDate: IsoDate } // Brake pads, tyres
type CarZone = "engine"|"frontAxle"|"rearAxle"|"cabin"|"body"|"underbody"
type ItemCategory = "legal"|"maintenance"|"wear"
interface ServiceItem { id: string; code: string; label: string; category: ItemCategory; rule: ServiceRule; cost: number; zone: CarZone }
```
- Every vehicle must carry all three `kind`s across its items. Catalogue in `scripts/generate-fleet.mjs` defines costs, intervals and zones.
- `code` is stable key shared with service history (e.g. `ENGINE_OIL`).

### 3.4 ServiceRecord
```json
{ "id": "SRV-VEH-001-ENGINE_OIL-2026-03-14", "vehicleId": "VEH-001", "itemCode": "ENGINE_OIL", "label": "Engine oil & filter", "date": "2026-03-14", "odometer": 88100, "cost": 5800, "technician": "Jashim", "notes": "optional" }
```
Sorted newest-first when returned.

### 3.5 Fleet wrapper
```json
{ "meta": { "workshop": "Service Desk", "city": "Dhaka", "currency": "BDT", "generatedAt": "2026-08-30", "seed": 20260830 }, "owners": [...], "vehicles": [...], "history": [...] }
```
- `generatedAt` is the anchor `today`. Backend should treat the `today` query param (or server date) as `asOf`. Never use wall clock inside the data file.

---

## 4) Next-due computation (backend must implement exactly)

All dates are `YYYY-MM-DD` computed in **UTC** to avoid DST drift. Helpers in `src/engine/dates.ts`:

```ts
parseIso(d) -> Date.UTC(y,m-1,d)
toIso(stamp) -> stamp.toISOString().slice(0,10)
addDays(d, n) -> toIso(parseIso(d)+ n*86400000)
addMonths(d, n) // clamp to end-of-month: 2026-01-31 +1mo = 2026-02-28
daysBetween(from,to) -> round((parseIso(to)-parseIso(from))/86400000) // negative if past
statusFor(daysUntil) -> daysUntil<0 ? "overdue" : daysUntil<=30 ? "dueSoon" : "fine"
```
- `DUE_SOON_DAYS = 30` (override via `DUE_SOON_DAYS` env; frontend reads `VITE_DUE_SOON_DAYS`, backend should read `DUE_SOON_DAYS`).

### 4.1 fixedDate
```
nextDueDate = rule.dueDate
daysUntil   = daysBetween(asOf, nextDueDate)
estimated   = false
why = daysUntil<0
  ? `Expired 14 Jun 2026, 77 days ago. This is a fixed date on the document.`
  : `Expires 20 Sep 2026. This is a fixed date on the document, so driving less does not push it back.`
```

### 4.2 interval
```
nextDueDate = addMonths(rule.lastDoneDate, rule.months)
daysUntil   = daysBetween(asOf, nextDueDate)
estimated   = false
why = `Last done 15 Jan 2026 and runs on a 6-month interval, so it falls due 15 Jul 2026, 46 days ago.`
```

### 4.3 distance
```
rate        = max(1, vehicle.avgKmPerDay)   // MIN_KM_PER_DAY = 1
elapsed     = max(0, daysBetween(vehicle.odometer.readAt, asOf))
projectedKm = round(vehicle.odometer.km + elapsed * rate)
dueAtKm     = rule.lastDoneOdometer + rule.intervalKm
kmRemaining = dueAtKm - projectedKm
daysUntil   = round(kmRemaining / rate)
nextDueDate = addDays(asOf, daysUntil)
estimated   = true
why = kmRemaining<0
  ? `Due at 115,000 km. The odometer read 100,000 km on 1 Aug 2026 and this vehicle runs about 50 km/day, so it is on roughly 101,450 km today — 5,000 km past due.`
  : `Due at 115,000 km. Projected 101,450 km today, so about 13,550 km left — roughly 271 days at 50 km/day.`
```

### 4.4 ItemSchedule (what backend returns per item)
```ts
interface ItemSchedule {
  item: ServiceItem;
  vehicleId: string;
  nextDueDate: IsoDate;
  daysUntil: number;        // negative if overdue
  status: "overdue"|"dueSoon"|"fine";
  why: string;
  estimated: boolean;
  dueAtKm?: number;         // distance only
  kmRemaining?: number;
  projectedKm?: number;
}
```

### 4.5 VehicleStatus (per vehicle roll-up)
```ts
interface VehicleStatus {
  vehicle: Vehicle;
  owner: Owner;
  schedules: ItemSchedule[];  // sorted ascending daysUntil
  overdue: ItemSchedule[];
  dueSoon: ItemSchedule[];
  fine: ItemSchedule[];
  worst: DueStatus;           // overdue > dueSoon > fine
  worstDaysOverdue: number;   // abs(daysUntil) of first overdue else 0
  dueValue: number;           // sum cost of overdue+dueSoon
  projectedKm: number;        // from §4.3
}
```

---

## 5) Fleet summary & call list (backend)

### 5.1 Summary (`GET /api/v1/fleet/summary`)
```ts
function summariseFleet(fleet, asOf) {
  statuses = vehicles.map(v => computeVehicleStatus(v, owner, asOf))
  items = statuses.flatMap(s => s.schedules)
  return {
    statuses, vehicles: statuses.length, owners: fleet.owners.length,
    itemsTracked: items.length,
    overdueItems: items.filter(s=>s.status==="overdue").length,
    dueSoonItems: items.filter(s=>s.status==="dueSoon").length,
    fineItems: items.filter(s=>s.status==="fine").length,
    vehiclesOverdue: statuses.filter(s=>s.worst==="overdue").length,
    vehiclesDueSoon: statuses.filter(s=>s.worst==="dueSoon").length,
    pipelineValue: statuses.reduce((sum,s)=>sum+s.dueValue,0),
    overdueValue: statuses.reduce((sum,s)=> sum + s.overdue.reduce((n,i)=>n+i.item.cost,0),0)
  }
}
```

### 5.2 Call list (`GET /api/v1/call-list`)
- Only vehicles where `overdue.length>0 || dueSoon.length>0`.
- Score per vehicle:
```ts
const PRIORITY_WEIGHTS = { perOverdueDay: 6, perImminenceDay: 1.5, perCurrencyUnit: 0.004 } // 25,000 BDT = 100 pts
function scoreVehicle(status: VehicleStatus): PriorityBreakdown {
  nearest = status.schedules[0]
  daysUntil = nearest?.daysUntil ?? Infinity
  urgency = max(0, -daysUntil) * 6
  imminenceDays = daysUntil<0 ? 30 : max(0, 30 - daysUntil)
  imminence = imminenceDays * 1.5
  value = status.dueValue * 0.004
  total = round1(urgency+imminence+value) // 1 decimal
}
```
- Rank descending `total`, tie-break `plate.localeCompare`.
- Each entry:
```ts
interface CallListEntry {
  vehicleStatus: VehicleStatus;
  priority: { urgency:number; imminence:number; value:number; total:number };
  talkingPoints: string[]; // one per due item: `${label} — ${relativeDays(daysUntil)}, ৳cost. ${why}`
}
```
- `relativeDays`: `-1`→"1 day overdue", `-12`→"12 days overdue", `0`→"due today", `1`→"due tomorrow", `<14`→"in N days", `<60`→"in N weeks", else "in N months".

---

## 6) Recording a completed service (backend)

`POST /api/v1/vehicles/:vehicleId/services` — body:
```json
{ "itemId": "VEH-001-ENGINE_OIL", "date": "2026-08-30", "odometer": 91015, "cost": 5800, "technician": "Jashim", "notes": "optional" }
```
Validation: vehicle and item must exist; `date <= asOf`; `odometer >=0`; `cost >=0`; `technician` non-empty.

Side effects (must match `src/engine/complete.ts` exactly):

```ts
function resetRule(item, date, odometer): ServiceItem {
  if (item.rule.kind==="fixedDate") return { ...item, rule:{ ...item.rule, dueDate: addMonths(date, item.rule.renewalMonths)}}
  if (item.rule.kind==="interval")  return { ...item, rule:{ ...item.rule, lastDoneDate: date }}
  if (item.rule.kind==="distance")  return { ...item, rule:{ ...item.rule, lastDoneOdometer: odometer, lastDoneDate: date }}
}
function completeService(fleet, input): { fleet: Fleet; record: ServiceRecord } {
  vehicle = fleet.vehicles.find(v=>v.id===input.vehicleId) // 404 if missing
  item    = vehicle.items.find(i=>i.id===input.itemId) // 404 if missing
  record  = { id:`SR-${vehicleId}-${item.code}-${date}-${history.length+1}`, vehicleId, itemCode:item.code, label:item.label, date, odometer, cost, technician, notes? }
  nextVehicle = { ...vehicle,
    odometer: odometer > vehicle.odometer.km ? {km:odometer, readAt:date} : vehicle.odometer,
    items: vehicle.items.map(i=> i.id===item.id ? resetRule(i,date,odometer) : i)
  }
  return { fleet:{...fleet, vehicles:fleet.vehicles.map(v=>v.id===vehicle.id ? nextVehicle : v), history:[record, ...fleet.history]}, record }
}
```
- Response `201 { record, vehicleStatus }` (or at least `record`). Frontend will refetch; no local replay.

---

## 7) REST API contract (backend must provide)

Base URL = `VITE_API_BASE_URL` (e.g. `http://localhost:8000/api/v1`). All responses `Content-Type: application/json`.

### `GET /api/v1/fleet?asOf=2026-08-30`
Raw fleet for offline inspection. Returns `Fleet`. `asOf` optional — if omitted use server today in UTC.

### `GET /api/v1/vehicles?asOf=2026-08-30`
Returns `VehicleStatus[]` (one per vehicle, with `schedules` already sorted). This is what FleetView and OwnersView render.

### `GET /api/v1/vehicles/:id?asOf=2026-08-30`
Single `VehicleStatus` + `history: ServiceRecord[]` (newest-first) for that vehicle. VehicleView uses this.

### `GET /api/v1/call-list?asOf=2026-08-30`
Returns `CallListEntry[]` already ranked per §5.2. The Today page renders this directly; do not require frontend to re-sort.

### `GET /api/v1/fleet/summary?asOf=2026-08-30`
Returns summary object from §5.1. Hero stats and dashboard tiles.

### `GET /api/v1/owners`
Returns `Owner[]` (or owners with vehicle counts if you prefer).

### `POST /api/v1/vehicles/:vehicleId/services`
As described in §6. On success `201` with `{ record: ServiceRecord, vehicleStatus?: VehicleStatus }`. On error `400|404` with `{ message: string }`.

### `GET /api/v1/rules`
Returns constants that drive UI copy (no frontend hard-coding):
```json
{ "dueSoonDays": 30, "priorityWeights": {"perOverdueDay":6,"perImminenceDay":1.5,"perCurrencyUnit":0.004}, "ruleDocs": {...}, "statusDocs": {...} }
```
Frontend's RulesView fetches this; if unavailable it falls back to local constants.

### `POST /api/v1/auth/login`
Workshop login. Frontend POSTs from `LoginView` and `src/lib/auth.tsx:loginViaBackend`.

Request:
```json
{ "email": "workshop@servicedesk.local", "password": "••••••••" }
```
`email` may be an email or phone/username — backend should accept any non-empty identifier that matches an `Owner`-adjacent workshop user. Trim + case-insensitive for email.

Success `200`:
```json
{ "token": "jwt-or-opaque", "user": { "id": "USR-001", "email": "workshop@servicedesk.local", "name": "Service Desk", "role": "admin|workshop|viewer" } }
```
Also accept `{ "access_token": "...", "user": {...} }`. Frontend stores `token` in `localStorage` under `servicedesk.auth.token.v1` and sends `Authorization: Bearer <token>` on every subsequent call (see `src/lib/api.ts:authHeader()`).

Failure `401` with `{ "message": "Invalid email or password." }` — frontend surfaces this verbatim in the login form. `422` for validation.

Dev bypass: when `VITE_DEV_AUTH=true` (or no backend configured) the login screen shows a **Dev bypass** button. It creates a local `dev-token-*` (`src/lib/auth.tsx:devLogin`) and never hits the backend — so the UI is viewable offline. Do not block this in production builds; the frontend simply hides the button when `VITE_DEV_AUTH` is false and a backend is configured.

### `POST /api/v1/auth/logout`
Optional. Frontend calls it on logout with `Authorization: Bearer <token>`; backend should invalidate token if it keeps a blocklist. `204` or `200` is fine. Frontend clears local storage regardless.

### `GET /api/v1/auth/me`
Optional but recommended. Frontend validates a stored token on cold boot by calling this with `Authorization: Bearer <token>`. Returns the same `user` shape or `401` (token expired → frontend clears session and shows LoginView again).

### `GET /api/v1/health`
Already required — return `{ ok: true, asOf: "2026-08-30" }`. Also accepts `Authorization` header when logged in but must not require it.

> Compatibility: keep `GET /api/v1/fleet` working for the current `loadFleet()` fallback. The enriched endpoints above can live alongside it. When auth is enabled, protect all data endpoints (`/fleet`, `/vehicles*`, `/call-list`, `/fleet/summary`, `/owners`, `/rules`, `POST /vehicles/:id/services`) with `Bearer` — return `401` when missing/invalid so the frontend can redirect to login. Allow `GET /health` and `POST /auth/login` anonymously.

CORS: allow `http://localhost:5173`. Validate `IsoDate` strings as `YYYY-MM-DD` calendar dates (UTC). Allow `Authorization` header.

---

## 8) Frontend integration (what to wire)

- `src/lib/api.ts` — expanded to call the 7 endpoints above + auth. All `GET` calls attach `Authorization: Bearer <token>` via `authHeader()` when a token is stored (see `src/lib/auth.tsx:getAuthToken`). `src/lib/store.tsx` already has `loadFleet`/`postCompletion` but will be extended to expose `useCallList()`, `useVehicleStatus(id)` etc that fetch from backend. No local `completeService` replay when backend is configured — just POST then refetch.
- `src/lib/auth.tsx` — `AuthProvider` + `useAuth()`. Reads/writes `servicedesk.auth.token.v1` + `user.v1`. Validates stored token on cold boot via `GET /auth/me`. Exposes `login(email,password)` → POST `/auth/login`, `devLogin()` (local `dev-token-*`), `logout()` → POST `/auth/logout`.
- `src/lib/theme.tsx` — `ThemeProvider` + `useTheme()`. Persists `servicedesk.theme.v1` (`light|dark`), respects `prefers-color-scheme`, toggles `html[data-theme]`. Header button `theme-toggle` flips it. No backend involvement — purely presentational but affects all tokens (`--bg`, `--surface`, etc in `src/styles/global.css`).
- `src/components/LoginView.tsx` — luxury split: left `login__showcase` (BREEZY-inspired big typography + pricing strip + 3D `HandKeyStage`), right `login__panel` (Payoneer-inspired `Sign In` form). Reads `backendConfigured`, calls `useAuth().login`; shows `Dev bypass` when `VITE_DEV_AUTH=true` or no backend. Fully responsive (`grid-template-columns: 1.1fr 0.9fr` → `@media 900px` stack).
- `src/components/TodayView.tsx` — today consumes `GET /call-list` + `GET /fleet/summary` directly. No `buildCallList`/`summariseFleet` import in backend mode.
- `src/components/FleetView.tsx` / `OwnersView.tsx` — consume `GET /vehicles`. No `computeVehicleStatus`.
- `src/components/VehicleView.tsx` — consumes `GET /vehicles/:id` (+ history). Dialog posts to `POST /vehicles/:id/services` and refreshes. History list comes from `history` array.
- `src/components/RulesView.tsx` — consumes `GET /rules`. Falls back to `src/engine/rules.ts`.
- `src/three/HandKey.tsx` — procedural hand holding a car key fob (no `.glb`, `FloatRig` + `RoundedBox` + `ContactShadows` + `Environment` with `Lightformer`; `hasWebGL()` → `handkey-fallback` CSS card). Used only on `LoginView`.
- `src/App.tsx` — `ThemeProvider → AuthProvider → AuthGate → FleetProvider`. `AuthGate` checks `useAuth().isAuthenticated`; if false it renders `<LoginView/>` regardless of hash. When authenticated it shows `Shell` (header with `source-pill` + `theme-toggle` + `user-pill` + logout, `FleetProvider`-backed pages). `FleetProvider` chooses backend vs sample source; `source pill` shows `Live · BASE` when backend is reachable.

Engine stays for: `public/data/fleet.json` offline demo, tests, and as backend reference. Do not delete `src/engine/*`.

---

## 9) 3D car + hand-key models (complete — no .glb, no CDN)

### 9.1 Car — `src/three/CarModel.tsx` + `src/three/CarStage.tsx`
Code-built car. `CarModel` extrudes a side silhouette per `bodyType` (sedan/hatchback/suv/mpv) with correct `halfLength/width/ride/wheelRadius`, metallic paint (`meshPhysicalMaterial` with `vehicle.colour`), glass, lights, wheels. `CarStage` wraps it in a `Canvas` with `ResponsiveCamera`, `ContactShadows`, `Environment` studio lights, and `ScrollRig` (hero spins with page scroll; inspect floats + follows pointer, with `prefers-reduced-motion` guard). Hotspots float via `Html` markers per `zoneAnchor()`. Fallback `CarSilhouette` + `hasWebGL()` check.

Backend wiring:
- `CarStage` expects `Pick<Vehicle,'bodyType'|'colour'>`. Backend must return `Vehicle.bodyType` and `Vehicle.colour` so the model reflects the real car.
- VehicleView groups `schedules` by `zone` into `Hotspot { zone, label, status, count }` (worst status per zone, count of non-fine items). Backend may optionally return `hotspots` pre-grouped on `GET /vehicles/:id`; if absent, frontend groups. Colours: `overdue:#ff4d3d dueSoon:#ffb020 fine:#2fcf8f`.
- Inspect mode uses `OrbitControls` (`enablePan:false, minPolarAngle 0.16π / max 0.5π, min/maxDistance 0.72–1.45×distance, damping`; `mode="hero"` stays scroll-driven). Hero shows first call-list vehicle's car (`headliner`) at `distance={7.6}`.
- Perf: `dpr {[1,1.8]}`, `powerPreference:"high-performance"`, `ContactShadows 512`, `Environment frames={1}`, real `<button>` hotspots for keyboard.

Related: `src/three/CarModel.tsx:139`, `src/three/CarStage.tsx:132`, `src/components/VehicleView.tsx:99`.

### 9.2 Car key — `src/three/HandKey.tsx` (login only)
Procedural floating car key fob (no `.glb`, `FloatRig` + `RoundedBox` + `ContactShadows` + `Environment` with `Lightformer`; `hasWebGL()` → `handkey-fallback` CSS card). `HandKeyStage` renders at `300px` in `LoginView`'s `login__stage` with a soft glow + pricing strip underneath (BREEZY layout). Login's left showcase provides the moody gradient/grid backdrop; the 3D is the hero object (like BREEZY's top-down convertible). Hand mesh was removed — key fob only, as requested.

Fallback: centred `🔑 Workshop key` card when WebGL is off — no blank.

No asset download, no HDRI.

Related: `src/three/HandKey.tsx:1`, `src/components/LoginView.tsx:9`.

---

## 10) Frontend file map

```
frontend/
  src/
    App.tsx                 ThemeProvider → AuthProvider → AuthGate → FleetProvider (login-gated shell)
    main.tsx
    components/
      LoginView.tsx         Luxury split login (→ POST /auth/login, dev bypass, HandKeyStage)
      TodayView.tsx         Hero + call list (→ GET /call-list, GET /fleet/summary)
      FleetView.tsx         Grid of VehicleStatus (→ GET /vehicles)
      OwnersView.tsx        Owners + vehicles (→ GET /vehicles + GET /owners)
      VehicleView.tsx       CarStage + schedule + history + RecordServiceDialog (→ GET /vehicles/:id)
      RecordServiceDialog.tsx  POST /vehicles/:id/services
      RulesView.tsx         Rule docs (→ GET /rules)
      ui.tsx                Badge/Chip/Stat/Card/Banner/StatusBar
    engine/                 Offline fallback + backend reference impl (DO NOT DELETE)
      types.ts  dates.ts  rules.ts  schedule.ts  callList.ts  complete.ts  format.ts  engine.test.ts
    lib/
      api.ts                Backend client (BASE + all 7 endpoints + authHeader)
      auth.tsx              AuthProvider + useAuth, loginViaBackend/devLogin + token persistence
      theme.tsx             ThemeProvider + useTheme (light|dark → html[data-theme])
      store.tsx             FleetProvider — chooses backend vs sample, no local replay when backend set
      router.ts             Hash router: #/ , #/fleet , #/owners , #/rules , #/vehicle/:id , #/login
    three/
      CarModel.tsx          Procedural car per bodyType + colour
      CarStage.tsx          Canvas, lights, shadows, hotspots, ScrollRig, responsive camera, OrbitControls (inspect)
      HandKey.tsx           Procedural hand + key fob for LoginView (FloatRig, RoundedBox, ContactShadows)
    styles/global.css       Tokens (+ [data-theme='light'] overrides), layout, hero, stage, cards, call list, vehicle, dialog, banners, login
  public/data/fleet.json    Sample fleet (scripts/generate-fleet.mjs, SEED 20260830, ANCHOR 2026-08-30)
  scripts/generate-fleet.mjs  Deterministic generator (prng mulberry32) — status mix back-solved
  .env.example / .env        VITE_API_BASE_URL (+ local vs deployed), VITE_DUE_SOON_DAYS, VITE_DEV_AUTH
  vite.config.ts  package.json  tsconfig.*
```

**Responsiveness — every page is mobile-first and verified down to 320 px (`src/styles/global.css`):**
- Header nav collapses to burger at `940px` (`nav[data-open]`), `source-pill` hides.
- Hero `grid-template-columns: 1.1fr 0.9fr → 1fr` at `900px`, stats `4→2→1` columns at `900/460`.
- Stage heights use `clamp(240px,38vw,400px)`, `ContactShadows` scales.
- Login split `1.1fr 0.9fr → 1fr` at `900px` (showcase `520px` min-height, stage `300→260px`), `@560px` full-bleed.
- Fleet/owner grids `auto-fill 280px`, tables `responsive` stack to cards at `860px`, call list `46px+1fr+auto → 34px+1fr` at `780px`, vehicle hero `1.15fr 1fr → 1fr` at `900px`, timeline `96px+1fr+auto → 1fr+auto` at `620px`, banners/dialog stack similarly. No horizontal scroll at any width.

---

## 11) Environment

```
# frontend/.env  (copy from frontend/.env.example)
VITE_API_BASE_URL=http://localhost:8000/api/v1   # empty = sample mode (uses public/data/fleet.json + src/engine/*)
# deployed example: VITE_API_BASE_URL=https://your-app.onrender.com/api/v1
VITE_DUE_SOON_DAYS=30
VITE_DEV_AUTH=true                                # show Dev bypass on login (set false in prod)
```
- `.env` lives in `frontend/` (see `frontend/.env` and `frontend/.env.example`). Git tracks `.env` but ignores `.env.local` / `*.local` — put personal/backend-dev URLs in `.env.local`, or edit `frontend/.env` directly. `VITE_API_BASE_URL` must be the full `/api/v1` base; frontend joins paths like `${BASE}/vehicles`. Restart `npm run dev` after changing `.env`.
- Backend should mirror `DUE_SOON_DAYS` and `PRIORITY_WEIGHTS` from §4/§5. Do not let frontend and backend drift — RulesView renders from `GET /rules` so the docs match the calculation. `VITE_DEV_AUTH` is frontend-only; backend can ignore it.

---

## 12) Tests backend must pass

Run `npm test` in `frontend/` — `src/engine/engine.test.ts` asserts:

- Date maths: `addMonths` clamps to end-of-month, `daysBetween`, DST-safe `addDays`, `relativeDays`.
- Status thresholds: `overdue` when `daysUntil<0`, `dueSoon` when `0..30`, `fine` when `>30`.
- Fixed date: uses printed date as-is, invariant to `avgKmPerDay`.
- Interval: `nextDue = addMonths(lastDoneDate, months)`.
- Distance: `projectedKm`, `dueAtKm`, `kmRemaining`, `daysUntil`, `estimated=true`, past-due detection, `MIN_KM_PER_DAY` floor, faster rate → fewer days.
- Completion: `fixedDate` → `dueDate = addMonths(date, renewalMonths)`, `interval` → `lastDoneDate=date`, `distance` → `lastDoneOdometer=odometer, lastDoneDate=date`; grows history; moves odometer only up; immutability; unknown vehicle/item throws.
- Call list: only overdue/dueSoon, sorted by priority, overdue above dueSoon, value tie-break, talkingPoints length and wording.
- Fleet brief: >=40 vehicles, >=25 owners, every vehicle has all three rule kinds, odometer+history present, no future service dates or negative odometers, realistic overdue/dueSoon/fine counts.

Copy the formulas verbatim from `src/engine/*` — these tests are the contract.

---

## 13) Design docs

- `P09_vehicle_service_public.json:1` — public case format example + distribution (42 vehicles, 27 owners, latest reading dated `today` which is a case field, never the clock).
- `EVENT.md` — team t043, problem p09, repo was empty at start.

---

## 14) What to ship

1. Backend implementing §7 (all endpoints, §4–§6 formulas, CORS for Vite dev server).
2. Optional: running `node scripts/generate-fleet.mjs` to regenerate `public/data/fleet.json` if you tweak `CATALOGUE` or `STATUS_MIX` — deterministic under the same seed.
3. Add `GET /api/v1/health` so the header pill can show live status.

Frontend is already backend-ready; once base URL is set it will hit your API. No frontend computation to carry over — everything is in §4–§6.

