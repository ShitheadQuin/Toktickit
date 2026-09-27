import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { Client } from 'pg';

// Labsheet §5.2 and §5.3. Never touches the dev database's data: builds a throwaway copy, applies
// the migrations up to Lab 3, inserts Lab 3-shaped rows, applies the Lab 4 migration, and checks
// nothing earlier was lost. Then applies the documented rollback and the migration again, since
// §5.2 asks for the recovery approach to be tested too.
const SERVER_DIR = path.join(__dirname, '..', '..');
const MIGRATIONS_DIR = path.join(SERVER_DIR, 'prisma', 'migrations');
const ROLLBACK_SQL = path.join(SERVER_DIR, 'prisma', 'rollback', 'lab4_actions_taken.down.sql');
const COPY_DB = 'toktickit_migration_test_lab4';

const devUrl = new URL(process.env.DATABASE_URL!);
const copyUrl = new URL(devUrl.toString());
copyUrl.pathname = `/${COPY_DB}`;

const migrationFolders = readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();
const lab4Index = migrationFolders.findIndex((name) => name.endsWith('_lab4_actions_taken'));
const lab4Folder = migrationFolders[lab4Index]!;

const runSql = (db: Client, file: string) => db.query(readFileSync(file, 'utf8'));
const runMigration = (db: Client, folder: string) => runSql(db, path.join(MIGRATIONS_DIR, folder, 'migration.sql'));

// Lab 3 shape: every role, owned and unowned Tickets in several statuses, an Attachment, a Public
// Comment and an Internal Note.
async function insertLab3Rows(db: Client) {
  await db.query(`INSERT INTO "Category" (id, name) VALUES (1, 'Hardware')`);
  await db.query(`INSERT INTO "RelatedSystem" (id, name) VALUES (1, 'Email')`);
  const users = [
    [1, 'Mig Requester', 'mig4-requester@toktickit.dev', 'REQUESTER'],
    [2, 'Mig Staff', 'mig4-staff@toktickit.dev', 'IT_STAFF'],
    [3, 'Mig Admin', 'mig4-admin@toktickit.dev', 'ADMINISTRATOR'],
  ];
  for (const [id, name, email, role] of users) {
    await db.query(
      `INSERT INTO "User" (id, name, email, "passwordHash", role, "mustChangePassword", "updatedAt")
       VALUES ($1, $2, $3, 'not-a-real-hash', $4, false, now())`,
      [id, name, email, role],
    );
  }
  const tickets = [
    ['TKT-2026-400001', 'NEW', null],
    ['TKT-2026-400002', 'IN_PROGRESS', 2],
    ['TKT-2026-400003', 'RESOLVED', 2],
    ['TKT-2026-400004', 'CLOSED', 2],
  ];
  for (const [number, status, owner] of tickets) {
    await db.query(
      `INSERT INTO "Ticket" ("ticketNumber", "requesterId", "categoryId", "relatedSystemId", summary, description,
         "requestedPriority", "itPriority", "currentStatus", "ticketOwnerId", "updatedAt")
       VALUES ($1, 1, 1, 1, $2, 'Lab 3 fixture', 'MEDIUM', 'HIGH', $3, $4, now())`,
      [number, `Fixture ${number}`, status, owner],
    );
  }
  const { rows: [second] } = await db.query(`SELECT id FROM "Ticket" WHERE "ticketNumber" = 'TKT-2026-400002'`);
  await db.query(
    `INSERT INTO "Attachment" ("ticketId", "originalFilename", "storedFilename", "mimeType", "sizeBytes")
     VALUES ($1, 'photo.png', 'mig4-photo.png', 'image/png', 2048)`,
    [second.id],
  );
  await db.query(`INSERT INTO "PublicComment" ("ticketId", "authorId", body) VALUES ($1, 1, 'Still broken')`, [second.id]);
  await db.query(`INSERT INTO "InternalNote" ("ticketId", "authorId", body) VALUES ($1, 2, 'Check the adapter')`, [second.id]);
  await db.query(`SELECT setval(pg_get_serial_sequence('"User"', 'id'), (SELECT max(id) FROM "User"))`);
}

// Everything Lab 1 to 3 stored, as plain rows, so before and after can be compared exactly.
async function snapshot(db: Client) {
  const q = async (sql: string) => (await db.query(sql)).rows;
  return {
    users: await q(`SELECT id, name, email, role::text, "isActive", "mustChangePassword" FROM "User" ORDER BY id`),
    tickets: await q(`SELECT id, "ticketNumber", "requesterId", "currentStatus"::text, "ticketOwnerId", "itPriority"::text,
                        "requestedPriority"::text, summary, "updatedAt" FROM "Ticket" ORDER BY id`),
    attachments: await q(`SELECT id, "ticketId", "storedFilename", "isActive" FROM "Attachment" ORDER BY id`),
    comments: await q(`SELECT id, "ticketId", "authorId", body FROM "PublicComment" ORDER BY id`),
    notes: await q(`SELECT id, "ticketId", "authorId", body FROM "InternalNote" ORDER BY id`),
  };
}

const tableExists = async (db: Client, table: string) =>
  (await db.query(`SELECT to_regclass($1) IS NOT NULL AS present`, [`"${table}"`])).rows[0].present;

describe('Lab 3 → Lab 4 migration', () => {
  let copy: Client;
  let before: Awaited<ReturnType<typeof snapshot>>;

  beforeAll(async () => {
    if (lab4Index === -1) throw new Error('Lab 4 migration folder (*_lab4_actions_taken) not found');

    const admin = new Client({ connectionString: devUrl.toString() });
    await admin.connect();
    await admin.query(`DROP DATABASE IF EXISTS ${COPY_DB} WITH (FORCE)`);
    await admin.query(`CREATE DATABASE ${COPY_DB}`);
    await admin.end();

    copy = new Client({ connectionString: copyUrl.toString() });
    await copy.connect();
    for (const folder of migrationFolders.slice(0, lab4Index)) await runMigration(copy, folder);
    await insertLab3Rows(copy);
    before = await snapshot(copy);
    await runMigration(copy, lab4Folder);
  }, 60_000);

  afterAll(async () => {
    await copy?.end();
    const admin = new Client({ connectionString: devUrl.toString() });
    await admin.connect();
    await admin.query(`DROP DATABASE IF EXISTS ${COPY_DB} WITH (FORCE)`);
    await admin.end();
  });

  // MIG-01 - AC-25, labsheet §5.1 and §5.2
  it('keeps every User, Ticket, Attachment, Public Comment and Internal Note exactly as it was', async () => {
    expect(await snapshot(copy)).toEqual(before);
  });

  it('gives every existing Ticket version 0, no Actions and no history', async () => {
    const { rows } = await copy.query(`SELECT version FROM "Ticket"`);
    expect(rows).toHaveLength(before.tickets.length);
    expect(rows.every((r) => r.version === 0)).toBe(true);
    expect((await copy.query(`SELECT count(*)::int AS n FROM "ActionTaken"`)).rows[0].n).toBe(0);
    expect((await copy.query(`SELECT count(*)::int AS n FROM "TicketStatusHistory"`)).rows[0].n).toBe(0);
  });

  it('rolls back with the documented down script without losing Lab 3 data, and migrates forward again', async () => {
    await runSql(copy, ROLLBACK_SQL);
    expect(await tableExists(copy, 'ActionTaken')).toBe(false);
    expect(await tableExists(copy, 'TicketStatusHistory')).toBe(false);
    expect(await snapshot(copy)).toEqual(before);

    await runMigration(copy, lab4Folder);
    expect(await tableExists(copy, 'ActionTaken')).toBe(true);
    expect(await snapshot(copy)).toEqual(before);
  });

  // MIG-02 - AC-26, labsheet §5.3
  it('runs the seed twice without duplicates and seeds the Lab 4 cases', async () => {
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
         (SELECT count(*) FROM "ActionTaken")::int AS actions,
         (SELECT count(*) FROM "PublicComment")::int AS comments,
         (SELECT count(*) FROM "InternalNote")::int AS notes`)).rows[0];

    runSeed();
    const afterFirst = await counts();
    runSeed();
    expect(await counts()).toEqual(afterFirst);

    const seeded = `t."ticketNumber" LIKE 'TKT-2026-8%'`;

    // Tickets with zero, one and several Actions.
    const { rows: perTicket } = await copy.query(`
      SELECT count(a.id)::int AS n FROM "Ticket" t LEFT JOIN "ActionTaken" a ON a."ticketId" = t.id
      WHERE ${seeded} GROUP BY t.id`);
    const sizes = perTicket.map((r) => r.n);
    expect(sizes).toContain(0);
    expect(sizes).toContain(1);
    expect(Math.max(...sizes)).toBeGreaterThan(1);

    // Every Action status, a follow up, Attachment Notes, and an Action done for someone else.
    const { rows: [mix] } = await copy.query(`SELECT
      array_agg(DISTINCT status::text ORDER BY status::text) AS statuses,
      count(*) FILTER (WHERE "followUpRequired")::int AS "followUps",
      count(*) FILTER (WHERE "attachmentNotes" IS NOT NULL)::int AS "attachmentNotes",
      count(*) FILTER (WHERE "assigneeId" <> "performedById")::int AS "assignedToOthers"
      FROM "ActionTaken"`);
    expect(mix.statuses).toEqual(['CANCELLED', 'COMPLETED', 'IN_PROGRESS', 'PLANNED']);
    expect(mix.followUps).toBeGreaterThan(0);
    expect(mix.attachmentNotes).toBeGreaterThan(0);
    expect(mix.assignedToOthers).toBeGreaterThan(0);

    // Every Ticket status and IT Priority, assigned and unassigned (labsheet §5.3).
    const { rows: [spread] } = await copy.query(`SELECT
      count(DISTINCT "currentStatus")::int AS statuses,
      count(DISTINCT "itPriority")::int AS priorities,
      count(*) FILTER (WHERE "ticketOwnerId" IS NULL)::int AS unassigned,
      count(*) FILTER (WHERE "ticketOwnerId" IS NOT NULL)::int AS assigned
      FROM "Ticket" t WHERE ${seeded}`);
    expect(spread).toEqual({ statuses: 8, priorities: 3, unassigned: expect.any(Number), assigned: expect.any(Number) });
    expect(spread.unassigned).toBeGreaterThan(0);
    expect(spread.assigned).toBeGreaterThan(0);

    // Seeded Resolved and Closed Tickets obey the resolution gate (BR-16).
    const { rows: gated } = await copy.query(`
      SELECT t."ticketNumber",
             count(a.id) FILTER (WHERE a.status = 'COMPLETED')::int AS completed,
             count(a.id) FILTER (WHERE a.status IN ('PLANNED', 'IN_PROGRESS'))::int AS open
      FROM "Ticket" t LEFT JOIN "ActionTaken" a ON a."ticketId" = t.id
      WHERE ${seeded} AND t."currentStatus" IN ('RESOLVED', 'CLOSED') GROUP BY t.id`);
    expect(gated.length).toBeGreaterThan(0);
    for (const row of gated) {
      expect(row.completed).toBeGreaterThan(0);
      expect(row.open).toBe(0);
    }

    // Zero and non-zero dashboard figures: an active Requester with no Tickets, and one with several.
    const { rows: requesters } = await copy.query(`
      SELECT count(t.id)::int AS n FROM "User" u LEFT JOIN "Ticket" t ON t."requesterId" = u.id
      WHERE u.role = 'REQUESTER' AND u."isActive" GROUP BY u.id`);
    expect(requesters.some((r) => r.n === 0)).toBe(true);
    expect(requesters.some((r) => r.n > 1)).toBe(true);
  }, 120_000);
});
