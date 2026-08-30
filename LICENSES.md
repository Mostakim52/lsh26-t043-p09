# Third-Party Material and AI Disclosure

Every third-party dependency used in this submission, with its license. Extracted
directly from each package's own `package.json` at the versions actually
installed. No AGPL/GPL/LGPL/MPL/SSPL or other copyleft licenses, and no
non-commercial/personal-use-only assets are used anywhere in this project.

## Runtime dependencies

### Backend (`backend/`)

| Package | Version | License |
| --- | --- | --- |
| express | 5.2.1 | MIT |
| @prisma/client | 6.19.3 | Apache-2.0 |
| zod | 4.5.4 | MIT |
| cors | 2.8.6 | MIT |
| helmet | 8.3.0 | MIT |
| bcryptjs | 3.0.3 | BSD-3-Clause |
| dotenv | 17.4.2 | BSD-2-Clause |

### Frontend (`frontend/`)

| Package | Version | License |
| --- | --- | --- |
| react | 19.2.8 | MIT |
| react-dom | 19.2.8 | MIT |
| three | 0.175.0 | MIT |
| @react-three/fiber | 9.7.0 | MIT |
| @react-three/drei | 10.7.8 | MIT |

## Development / build-time dependencies

Not shipped in either production artifact (the compiled backend `dist/`
output or the built frontend static bundle) — listed for completeness.

### Backend

| Package | Version | License |
| --- | --- | --- |
| typescript | 5.9.3 | Apache-2.0 |
| tsx | 4.23.13 | MIT |
| prisma (CLI) | 6.19.3 | Apache-2.0 |
| vitest | 4.1.11 | MIT |
| supertest | 7.2.2 | MIT |
| @types/node | 26.4.0 | MIT |
| @types/express | 5.0.6 | MIT |
| @types/cors | 2.8.19 | MIT |
| @types/bcryptjs | 2.4.6 | MIT |
| @types/supertest | 7.2.1 | MIT |

### Frontend

| Package | Version | License |
| --- | --- | --- |
| typescript | 5.9.3 | Apache-2.0 |
| vite | 6.4.3 | MIT |
| @vitejs/plugin-react | 4.7.0 | MIT |
| vitest | 2.1.9 | MIT |
| @types/node | 22.13.0 | MIT |
| @types/react | 19.2.18 | MIT |
| @types/react-dom | 19.0.5 | MIT |
| @types/three | 0.175.0 | MIT |

## Assets

No downloaded 3D models, fonts, icon packs, or stock images. The car and key
fob models on the login and vehicle pages are procedurally generated in code
(`frontend/src/three/CarModel.tsx`, `frontend/src/three/HandKey.tsx`) — no
`.glb`/`.gltf` files, no CDN-hosted assets, no HDRI environment maps.

## Sample data

`backend/src/db/data/cases.json` is a copy of the organizer-published
`P09_vehicle_service_public.json` fixture from the participant pack, used
under the event's terms to seed the database (case `PUB-01`).

## AI tools

Claude Code (Anthropic) was used throughout — backend implementation (Express
routes, Prisma schema, the ported calculation engine, auth), the Render/
Supabase/Vercel deployment, and the vehicle-owner plate-lookup feature. Every
formula was checked against the frontend's own `engine.test.ts` spec (29/29
passing when run against the ported backend code) and further verified by 20
new backend route tests (49/49 passing) plus live end-to-end checks against
the production database and the deployed browser session — not just accepted
from the model's output. See `evaluation-manifest.json` for the structured
disclosure.

## Original-work statement

Everything not declared in this file or `EVENT.md` was created by the
registered team during the event window.
