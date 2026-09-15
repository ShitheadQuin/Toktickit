import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { Client } from 'pg';
import bcrypt from 'bcryptjs';
import { LOCAL_DEV_INITIAL_PASSWORD } from '../../prisma/seed-credentials';

// These tests never touch the dev database's data. They build a throwaway copy, apply the Lab 2
// migrations, insert Lab 2-shaped rows, apply the Lab 3 migration, then check nothing was lost.
const SERVER_DIR = path.join(__dirname, '..', '..');
const MIGRATIONS_DIR = path.join(SERVER_DIR, 'prisma', 'migrations');
const COPY_DB = 'toktickit_migration_test';

const devUrl = new URL(process.env.DATABASE_URL!);
const copyUrl = new URL(devUrl.toString());
copyUrl.pathname = `/${COPY_DB}`;

const migrationFolders = readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();
const lab3Index = migrationFolders.findIndex((name) => name.endsWith('_lab3_user_model'));

// Lab 2 shape: several Tickets per Requester, an Attachment-less Ticket, a Ticket with two
// Attachments, and an inactive Requester who still owns a Ticket.
const LAB2_REQUESTERS = [
  { id: 1, name: 'Fixture Active One', email: 'mig-one@toktickit.dev', isActive: true },
  { id: 2, name: 'Fixture Active Two', email: 'mig-two@toktickit.dev', isActive: true },
  { id: 3, name: 'Fixture Inactive', email: 'mig-inactive@toktickit.dev', isActive: false },
];
const LAB2_TICKETS = [
  { number: 'TKT-2026-000001', requesterId: 1, priority: 'HIGH', attachments: 1 },
  { number: 'TKT-2026-000002', requesterId: 1, priority: 'LOW', attachments: 0 },
  { number: 'TKT-2026-000003', requesterId: 2, priority: 'MEDIUM', attachments: 2 },
  { number: 'TKT-2026-000004', requesterId: 3, priority: 'LOW', attachments: 0 },
];

const runMigration = (db: Client, folder: string) =>
  db.query(readFileSync(path.join(MIGRATIONS_DIR, folder, 'migration.sql'), 'utf8'));

async function insertLab2Rows(db: Client) {
  await db.query(`INSERT INTO "Category" (id, name) VALUES (1, 'Hardware')`);
  await db.query(`INSERT INTO "RelatedSystem" (id, name) VALUES (1, 'Email')`);
  for (const r of LAB2_REQUESTERS) {
    await db.query(
      `INSERT INTO "Requester" (id, name, email, "isActive", "updatedAt") VALUES ($1, $2, $3, $4, now())`,
      [r.id, r.name, r.email, r.isActive],
    );
  }
  for (const t of LAB2_TICKETS) {
    const { rows } = await db.query(
      `INSERT INTO "Ticket" ("ticketNumber", "requesterId", "categoryId", "relatedSystemId", summary,
         description, "requestedPriority", "updatedAt")
       VALUES ($1, $2, 1, 1, $3, 'Lab 2 fixture', $4, now()) RETURNING id`,
      [t.number, t.requesterId, `Fixture ${t.number}`, t.priority],
    );
    for (let n = 0; n < t.attachments; n++) {
      await db.query(
        `INSERT INTO "Attachment" ("ticketId", "originalFilename", "storedFilename", "mimeType", "sizeBytes")
         VALUES ($1, 'screenshot.png', $2, 'image/png', 1024)`,
        [rows[0].id, `${t.number}-${n}.png`],
      );
    }
  }

  // Explicit ids above don't advance the SERIAL sequences; move them on so later inserts
  // (the seed in MIG-03) don't collide with the fixture rows.
  for (const table of ['Category', 'RelatedSystem', 'Requester']) {
    await db.query(`SELECT setval(pg_get_serial_sequence('"${table}"', 'id'), (SELECT max(id) FROM "${table}"))`);
  }
}

describe('Lab 2 → Lab 3 migration', () => {
  let copy: Client;

  beforeAll(async () => {
    if (lab3Index === -1) throw new Error('Lab 3 migration folder (*_lab3_user_model) not found');

    const admin = new Client({ connectionString: devUrl.toString() });
    await admin.connect();
    await admin.query(`DROP DATABASE IF EXISTS ${COPY_DB} WITH (FORCE)`);
    await admin.query(`CREATE DATABASE ${COPY_DB}`);
    await admin.end();

    copy = new Client({ connectionString: copyUrl.toString() });
    await copy.connect();
    for (const folder of migrationFolders.slice(0, lab3Index)) await runMigration(copy, folder);
    await insertLab2Rows(copy);
    for (const folder of migrationFolders.slice(lab3Index)) await runMigration(copy, folder);
  }, 60_000);

  afterAll(async () => {
    await copy?.end();
    const admin = new Client({ connectionString: devUrl.toString() });
    await admin.connect();
    await admin.query(`DROP DATABASE IF EXISTS ${COPY_DB} WITH (FORCE)`);
    await admin.end();
  });

  // MIG-01 - AC-23, BR-24
  it('keeps every Lab 2 Ticket and Attachment with its original owner', async () => {
    const { rows } = await copy.query(`
      SELECT t."ticketNumber", u.email, u.role::text AS role, count(a.id)::int AS attachments
      FROM "Ticket" t
      JOIN "User" u ON u.id = t."requesterId"
      LEFT JOIN "Attachment" a ON a."ticketId" = t.id
      GROUP BY t.id, u.id
      ORDER BY t."ticketNumber"`);

    expect(rows).toEqual(
      LAB2_TICKETS.map((t) => ({
        ticketNumber: t.number,
        email: LAB2_REQUESTERS.find((r) => r.id === t.requesterId)!.email,
        role: 'REQUESTER',
        attachments: t.attachments,
      })),
    );
  });

  // MIG-01 - labsheet §4.5: IT Priority initially copies Requested Priority
  it('copies Requested Priority into IT Priority and leaves Lab 2 Tickets New and unassigned', async () => {
    const { rows } = await copy.query(`
      SELECT "requestedPriority"::text AS requested, "itPriority"::text AS it,
             "currentStatus"::text AS status, "ticketOwnerId"
      FROM "Ticket"`);

    expect(rows).toHaveLength(LAB2_TICKETS.length);
    for (const row of rows) {
      expect(row.it).toBe(row.requested);
      expect(row.status).toBe('NEW');
      expect(row.ticketOwnerId).toBeNull();
    }
  });

  // MIG-02 - specification.md §11 (logging in with it is covered in #35)
  it('gives every migrated Requester the documented initial password, to change at first login', async () => {
    const { rows } = await copy.query(
      `SELECT email, "isActive", role::text AS role, "mustChangePassword", "passwordHash" FROM "User" ORDER BY id`,
    );

    expect(rows.map(({ email, isActive }) => ({ email, isActive }))).toEqual(
      LAB2_REQUESTERS.map(({ email, isActive }) => ({ email, isActive })),
    );
    for (const user of rows) {
      expect(user.role).toBe('REQUESTER');
      expect(user.mustChangePassword).toBe(true);
      expect(user.passwordHash).not.toBe(LOCAL_DEV_INITIAL_PASSWORD);
      expect(await bcrypt.compare(LOCAL_DEV_INITIAL_PASSWORD, user.passwordHash)).toBe(true);
    }

    const { rows: [column] } = await copy.query(`
      SELECT is_nullable FROM information_schema.columns
      WHERE table_name = 'User' AND column_name = 'passwordHash'`);
    expect(column.is_nullable).toBe('NO');
  });

  // MIG-03 - labsheet §5.3
  it('runs the seed twice without creating duplicates, and seeds the required accounts', async () => {
    const runSeed = () =>
      execSync('npx tsx prisma/seed.ts', {
        cwd: SERVER_DIR,
        env: { ...process.env, DATABASE_URL: copyUrl.toString() },
        stdio: 'pipe',
      });
    const counts = async () =>
      (await copy.query(`SELECT
         (SELECT count(*) FROM "User")::int AS users,
         (SELECT count(*) FROM "Ticket")::int AS tickets,
         (SELECT count(*) FROM "PublicComment")::int AS comments,
         (SELECT count(*) FROM "InternalNote")::int AS notes`)).rows[0];

    runSeed();
    const afterFirst = await counts();
    runSeed();
    expect(await counts()).toEqual(afterFirst);

    const { rows: [accounts] } = await copy.query(`SELECT
      count(*) FILTER (WHERE role = 'REQUESTER' AND "isActive")::int      AS "activeRequesters",
      count(*) FILTER (WHERE role = 'REQUESTER' AND NOT "isActive")::int  AS "inactiveRequesters",
      count(*) FILTER (WHERE role = 'IT_STAFF' AND "isActive")::int       AS "activeStaff",
      count(*) FILTER (WHERE role = 'IT_STAFF' AND NOT "isActive")::int   AS "inactiveStaff",
      count(*) FILTER (WHERE role = 'ADMINISTRATOR' AND "isActive")::int  AS "activeAdmins"
      FROM "User"`);
    expect(accounts.activeRequesters).toBeGreaterThanOrEqual(4);
    expect(accounts.inactiveRequesters).toBeGreaterThanOrEqual(1);
    expect(accounts.activeStaff).toBeGreaterThanOrEqual(3);
    expect(accounts.inactiveStaff).toBeGreaterThanOrEqual(1);
    expect(accounts.activeAdmins).toBeGreaterThanOrEqual(1);
    expect(afterFirst.comments).toBeGreaterThan(0);
    expect(afterFirst.notes).toBeGreaterThan(0);
  }, 120_000);
});
