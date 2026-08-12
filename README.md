# TokTickIT

IT service desk vertical slice: React (Vite + Bootstrap) → Express REST API (TypeScript) → Prisma → PostgreSQL.

Lab 1 proves the stack works end-to-end: a **Check System** button reports backend health and lists the four supported request categories (Account and Access, Hardware, Software, Network).

## Prerequisites

- Node.js 18+
- PostgreSQL 14+, running locally on port 5432
- Git

## Project structure

```
toktickit/
├── client/          React + TypeScript + Vite + Bootstrap frontend
├── server/          Node.js + Express + TypeScript backend, Prisma ORM
├── docs/lab-01/     Lab 1 submission evidence (ai_use.md, reviewer.md, tests.md)
└── .gitignore
```

## 1. Install dependencies

```bash
cd client && npm install
cd ../server && npm install
```

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

Applies the Prisma migrations (creating the `Category` table) and seeds the four required categories
(Account and Access, Hardware, Software, Network). The seed uses `upsert` keyed on the unique `name`
field, so running it more than once is safe and won't create duplicates.

## 4. Run the backend

```bash
cd server
npm run dev
```

Starts the Express API on `http://localhost:3000`.

## 5. Run the frontend

```bash
cd client
npm run dev
```

Starts the Vite dev server on `http://localhost:5173`.

## 6. Run tests

```bash
cd client && npm test
cd server && npm test
```

Frontend tests run with Vitest; backend tests run with Vitest + Supertest (Supertest imports the Express app directly, so no server needs to be running to test it).
