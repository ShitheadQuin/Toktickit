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
├── artifacts/       Screenshots captured locally by e2e/lab-02/responsive.spec.ts (gitignored)
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
npx prisma migrate dev
npx prisma db seed
```

Applies the Prisma migrations (Category, Requester, RelatedSystem, Ticket, Attachment tables) and
seeds the reference data: the four required categories (Account and Access, Hardware, Software,
Network), several Related Systems, and a mix of active/inactive Development Requesters. The seed
uses `upsert`/idempotent inserts, so running it more than once is safe and won't create duplicates.

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

## 7. Run the Playwright E2E/UI-style/responsive suite (Lab 2)

```bash
cd e2e
npm test
```

Starts both dev servers automatically (`webServer` in `playwright.config.ts`) if they aren't
already running, then runs the requester-ticket-flow, UI-style and responsive specs against the
real app and real Postgres — no mocked fetches, unlike the Vitest UI suites above. Requires
PostgreSQL running and at least two active Development Requesters seeded. Responsive screenshots
are written to `artifacts/lab-02/screenshots/` (gitignored — captured locally per author, not
committed to the repository).
