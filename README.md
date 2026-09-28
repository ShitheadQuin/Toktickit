# TokTickIT

IT service desk vertical slice: React (Vite + Bootstrap) → Express REST API (TypeScript) → Prisma → PostgreSQL.

Lab 1 proved the stack works end-to-end with a Check System page (still available at `/diagnostics`).

Lab 2 built the real IT service desk: Create Ticket, My Tickets (search/filter/sort/pagination), a read-only Ticket Detail screen, and the attachment lifecycle (upload, download, soft removal) — all scoped so a Requester can only ever see their own Tickets. A Development Requester selector stood in for login.

Lab 3 replaces that selector with real authentication and role-based authorization for three roles: Requester, IT Staff and Administrator. Users sign in with email and password and must change an initial password at first login. IT Staff get a Ticket Queue and a Ticket Detail screen for claiming and reassigning Tickets, setting IT Priority, moving status through the permitted workflow, and posting Public Comments and Internal Notes. Administrators get a User Management screen. Every rule is enforced by the backend, not only by hiding controls.

Lab 4 completes the product. IT Staff record the Actions Taken on each Ticket (who did what, when, the result, and any follow up), and a Ticket can only be Resolved once its work is recorded as complete. Every status change is kept in an append-only Status History, and a Ticket changed by someone else meanwhile is refused instead of overwritten. Each role lands on its own Dashboard: Requesters see their own Tickets and what waits for their reply, IT Staff and Administrators see the queue at a glance, and every figure opens the matching list.

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
├── e2e/             Playwright end-to-end, UI style, accessibility and responsive suites
│   ├── lab-02/
│   ├── lab-03/
│   └── lab-04/
├── docs/lab-01/     Lab 1 submission evidence
├── docs/lab-02/     Lab 2 engineering contract and submission evidence
├── docs/lab-03/     Lab 3 engineering contract and submission evidence
├── docs/lab-04/     Lab 4 engineering contract and submission evidence
│   (specification.md, api-spec.md, ui-spec.md, tests.md, reviewer.md, ai-use.md)
├── artifacts/
│   ├── lab-02/screenshots/   Captures Lab 2 was submitted with
│   ├── lab-03/screenshots/   Captures Lab 3 was submitted with
│   └── lab-04/screenshots/   Lab 4 evidence, one folder per graded part
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
`Requester` table into `User` in place so existing Tickets keep their owners, and Lab 4's
`lab4_actions_taken`, which adds the Actions Taken and Status History tables and a `version` on
every Ticket without changing any existing row. It then seeds the reference data, the local
accounts, sample Tickets in every status, example Public Comments and Internal Notes, and Actions
Taken in every Action status. The seed only creates what is missing and never overwrites an existing
account, Ticket or Action, so running it more than once is safe.

**Upgrading a Lab 3 database:** take a backup first (`pg_dump -U <username> toktickit >
backup_before_lab4.sql`), then run the three commands above. Never accept an offer from Prisma to
reset the database; it deletes every row. To undo the Lab 4 migration, apply
`server/prisma/rollback/lab4_actions_taken.down.sql`, which removes only what Lab 4 added.

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

### Demonstration walk-through

1. Sign in as `pimchanok.rattana` (IT Staff). The Staff Dashboard opens; select a card, for example
   **My Tickets**, and the Ticket Queue opens with the same Tickets.
2. Open an In Progress Ticket you own. Under **Actions Taken**, choose **Add Action**, record what was
   done, and save. Move an Action to Completed and see **Resolved** become available in the status
   control; the Status History lists every change.
3. Sign out and sign in as `kritsada.boonmee` (Requester). His Dashboard shows only his Tickets,
   **Waiting for Me** marks the ones needing his reply, and each Ticket shows its Actions Taken and
   Status History read only.
4. Sign in as `duangjai.meesuk` (Administrator) for the same Staff Dashboard plus User Accounts,
   and the Users screen.

## 6. Run the unit/API/UI test suites

```bash
cd client && npm test
cd ../server && npx tsc --noEmit && npm test
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
responsive), `e2e/lab-03/` (authentication, staff Ticket flow, user administration, UI style,
accessibility, responsive) and `e2e/lab-04/` (Actions Taken flow, Ticket resolution, dashboards,
UI style, accessibility, responsive, hardening) against the real app and real Postgres — no mocked
fetches, unlike the Vitest UI suites above. Requires PostgreSQL running with the seed applied; the
specs create their own fixture accounts.

The Lab 2 and Lab 3 responsive specs check for horizontal overflow at desktop, tablet and mobile
widths but no longer write screenshots: `artifacts/lab-02/screenshots/` and
`artifacts/lab-03/screenshots/` hold the committed captures those labs were submitted with and
are kept as that record. Lab 4's evidence in `artifacts/lab-04/screenshots/` was captured from the
seeded data, not by the test run.
