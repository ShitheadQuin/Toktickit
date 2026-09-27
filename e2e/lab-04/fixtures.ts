import path from 'node:path';
import dotenv from 'dotenv';
import { Client } from 'pg';
import bcrypt from 'bcryptjs';
import type { Page } from '@playwright/test';

// Lab 4 E2E fixtures: dedicated users and one Ticket, never the seeded accounts, removed again
// afterwards children first (Actions, status history), since an Action's Ticket link is RESTRICT.
export const PASSWORD = 'E2ELab4Pass1';
export const STAFF_A = { email: 'e2e-lab4-staff-a@toktickit.dev', name: 'E2E Staff Anan' };
export const STAFF_B = { email: 'e2e-lab4-staff-b@toktickit.dev', name: 'E2E Staff Busaba' };
export const REQUESTER = { email: 'e2e-lab4-requester@toktickit.dev', name: 'E2E Requester Chai' };
export const TICKET_NUMBER = 'TKT-2099-950001';
export const TICKET_SUMMARY = 'E2E-01 laptop will not charge';

const EMAILS = [STAFF_A.email, STAFF_B.email, REQUESTER.email];

async function connect() {
  dotenv.config({ path: path.join(__dirname, '..', '..', 'server', '.env') });
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  return client;
}

async function removeRows(client: Client) {
  const ticket = `(SELECT id FROM "Ticket" WHERE "ticketNumber" = $1)`;
  await client.query(`DELETE FROM "ActionTaken" WHERE "ticketId" IN ${ticket}`, [TICKET_NUMBER]);
  await client.query(`DELETE FROM "TicketStatusHistory" WHERE "ticketId" IN ${ticket}`, [TICKET_NUMBER]);
  await client.query(`DELETE FROM "PublicComment" WHERE "ticketId" IN ${ticket}`, [TICKET_NUMBER]);
  await client.query(`DELETE FROM "InternalNote" WHERE "ticketId" IN ${ticket}`, [TICKET_NUMBER]);
  await client.query(`DELETE FROM "Ticket" WHERE "ticketNumber" = $1`, [TICKET_NUMBER]);
  await client.query(`DELETE FROM "Session" WHERE "userId" IN (SELECT id FROM "User" WHERE email = ANY($1))`, [EMAILS]);
  await client.query(`DELETE FROM "User" WHERE email = ANY($1)`, [EMAILS]);
}

/** Two active IT Staff, a Requester, and an In Progress Ticket owned by Staff A. Returns the Ticket id. */
export async function setUpActionsFixtures(): Promise<number> {
  const client = await connect();
  try {
    await removeRows(client);
    const passwordHash = await bcrypt.hash(PASSWORD, 12);
    const insertUser = `INSERT INTO "User" (name, email, "passwordHash", role, "mustChangePassword", "isActive", "updatedAt")
       VALUES ($1, $2, $3, $4, false, true, now()) RETURNING id`;
    const a = await client.query(insertUser, [STAFF_A.name, STAFF_A.email, passwordHash, 'IT_STAFF']);
    await client.query(insertUser, [STAFF_B.name, STAFF_B.email, passwordHash, 'IT_STAFF']);
    const requester = await client.query(insertUser, [REQUESTER.name, REQUESTER.email, passwordHash, 'REQUESTER']);

    const category = await client.query(`SELECT id FROM "Category" WHERE "isActive" ORDER BY id LIMIT 1`);
    const relatedSystem = await client.query(`SELECT id FROM "RelatedSystem" WHERE "isActive" ORDER BY id LIMIT 1`);
    // Created a day ago, so an Action dated "now" is after the Ticket (BR-06). The dev database's session
    // time zone is Asia/Bangkok while Prisma reads these columns as UTC, so the time is written in UTC.
    const ticket = await client.query(
      `INSERT INTO "Ticket" ("ticketNumber", "ticketDate", "createdAt", "requesterId", "categoryId", "relatedSystemId",
         summary, description, "requestedPriority", "itPriority", "currentStatus", "ticketOwnerId", "updatedAt")
       VALUES ($1, (now() AT TIME ZONE 'UTC') - interval '1 day', (now() AT TIME ZONE 'UTC') - interval '1 day', $2, $3, $4, $5, $6, 'MEDIUM', 'HIGH', 'IN_PROGRESS', $7, now() AT TIME ZONE 'UTC')
       RETURNING id`,
      [TICKET_NUMBER, requester.rows[0].id, category.rows[0].id, relatedSystem.rows[0].id, TICKET_SUMMARY,
        'The laptop shows 0% and does not charge with the supplied adapter.', a.rows[0].id],
    );
    return ticket.rows[0].id as number;
  } finally {
    await client.end();
  }
}

export async function tearDownActionsFixtures() {
  const client = await connect();
  try {
    await removeRows(client);
  } finally {
    await client.end();
  }
}

/** Deactivates (or reactivates) a fixture user directly, to produce the inactive-assignee case. */
export async function setActive(email: string, isActive: boolean) {
  const client = await connect();
  try {
    await client.query(`UPDATE "User" SET "isActive" = $2, "updatedAt" = now() WHERE email = $1`, [email, isActive]);
  } finally {
    await client.end();
  }
}

export async function signIn(page: Page, email: string, landing: string) {
  await page.goto('/login');
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/^password$/i).fill(PASSWORD);
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForURL(`**${landing}`);
}

export async function signOut(page: Page) {
  await page.getByRole('button', { name: /log ?out/i }).click();
  await page.waitForURL('**/login');
}
