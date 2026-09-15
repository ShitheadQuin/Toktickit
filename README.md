# TokTickIT

IT service desk vertical slice: React (Vite + Bootstrap) → Express REST API (TypeScript) → Prisma → PostgreSQL.

Lab 1 proved the stack works end-to-end with a Check System page (still available at `/diagnostics`).

Lab 2 builds the real IT service desk: a Development Requester selector standing in for login, Create Ticket, My Tickets (search/filter/sort/pagination), a read-only Ticket Detail screen, and the attachment lifecycle (upload, download, soft removal) — all scoped so a Requester can only ever see their own Tickets.

## Prerequisites

- Node.js 18+
- PostgreSQL 14+, running locally on port 5432
- Git

## Project structure

```
toktickit/
├── client/          React + TypeScript + Vite + Bootstrap frontend
├── server/          Node.js + Express + TypeScript backend, Prisma ORM
│   └── uploads/     Attachment files, server-generated filenames (gitignored)
├── e2e/             Playwright end-to-end, UI style and responsive suite (Lab 2)
├── docs/lab-01/     Lab 1 submission evidence
├── docs/lab-02/     Lab 2 engineering contract and submission evidence
│   (specification.md, api-spec.md, ui-spec.md, tests.md, reviewer.md, ai-use.md)
├── artifacts/       Responsive screenshots written by e2e/lab-02/responsive.spec.ts
└── .gitignore
```

## 1. Install dependencies

```bash
cd client && npm install
cd ../server && npm install
cd ../e2e && npm install
npx playwright install chromium
```

The `e2e/` install is only needed if you plan to run the Playwright suite (§7 below).

## 2. Configure environment variables

Inside `server/`, copy the example env file and fill in your local PostgreSQL credentials:

```bash
cd server
cp .env.example .env
```

Edit `.env` and set `DATABASE_URL` to point at your local PostgreSQL database, e.g.:

```
DATABASE_URL="postgresql://<username>:<password>@localhost:5432/toktickit?schema=public"
```

## 3. Set up the database

```bash
cd server
npx prisma migrate deploy
npx prisma generate
npx prisma db seed
```

Applies the Prisma migrations, including Lab 3's `lab3_user_model`, which turns the Lab 2
`Requester` table into `User` in place so existing Tickets keep their owners. It then seeds the
reference data, the local accounts, sample Tickets in every status, and example Public Comments
and Internal Notes. The seed only creates what is missing and never overwrites an existing account
or Ticket, so running it more than once is safe.

### Local development accounts

**Local development only.** Every seeded account, and every Requester migrated from Lab 2, starts
with the password `TokTick2026` and must change it at first login. It is not a real credential.

| Role | Email (all `@toktickit.dev`) | Active |
|---|---|---|
| Requester | `anong.srisai`, `kritsada.boonmee`, `suphachai.wattana`, `nalinee.chaiyaporn` | yes |
| Requester | `ratchanee.somsak` | no |
| IT Staff | `pimchanok.rattana`, `thanawat.kittisak`, `wiriya.charoen` | yes |
| IT Staff | `somporn.inthara` | no |
| Administrator | `duangjai.meesuk` | yes |

## 4. Run the backend

```bash
cd server
npm run dev
```

Starts the Express API on `http://localhost:3000`. Uploaded attachments are written to
`server/uploads/` (created automatically, gitignored — never committed).

## 5. Run the frontend

```bash
cd client
npm run dev
```

Starts the Vite dev server on `http://localhost:5173`. `/api` requests are proxied to the backend,
so open the app at `http://localhost:5173`, not the API port directly.

## 6. Run the unit/API/UI test suites

```bash
cd client && npm test
cd server && npm test
```

Frontend tests run with Vitest; backend tests run with Vitest + Supertest (Supertest imports the
Express app directly, so no server needs to be running to test it — it does need PostgreSQL
running, since these tests hit the real database).

## 7. Run the Playwright E2E/UI-style/responsive suite

```bash
cd e2e
npm test
```

Starts both dev servers automatically (`webServer` in `playwright.config.ts`) if they aren't
already running, then runs every spec under `e2e/lab-02/` (requester-ticket-flow, UI-style,
responsive) and `e2e/lab-03/` (authentication) against the real app and real Postgres — no mocked
fetches, unlike the Vitest UI suites above. Requires PostgreSQL running with the seed applied; the
specs create their own fixture accounts.

The Lab 2 responsive spec checks for horizontal overflow at desktop, tablet and mobile widths but
no longer writes screenshots. `artifacts/lab-02/screenshots/` holds the committed captures Lab 2
was submitted with and is kept as that record. Lab 3's screenshots are written to
`artifacts/lab-03/screenshots/` (Issue #40).
