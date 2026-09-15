import path from 'node:path';
import dotenv from 'dotenv';
import { Client } from 'pg';
import bcrypt from 'bcryptjs';
import type { Page } from '@playwright/test';

// #36 removes the Development Requester selector; every Lab 2 E2E spec now logs in as a real
// session-based Requester instead. Self-contained fixture accounts, same reasoning as
// e2e/lab-03/fixtures.ts - never the real seeded accounts the plan's screenshot evidence depends on.
export const E2E_REQUESTER_A_EMAIL = 'e2e-lab2-requester-a@toktickit.dev';
export const E2E_REQUESTER_B_EMAIL = 'e2e-lab2-requester-b@toktickit.dev';
export const E2E_REQUESTER_PASSWORD = 'E2ERequester1';

async function connect() {
  dotenv.config({ path: path.join(__dirname, '..', '..', 'server', '.env') });
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  return client;
}

async function upsertRequester(client: Client, email: string) {
  // A real upsert, not delete-then-recreate: every lab-02 spec file shares this same fixture
  // email, and by the time a later file's beforeAll runs, an earlier file may already have
  // created real Tickets owned by this row - deleting it would violate the Ticket FK constraint.
  // Keeping the same row (and so the same id) across files is also what a shared fixture needs.
  const passwordHash = await bcrypt.hash(E2E_REQUESTER_PASSWORD, 12);
  await client.query(
    `INSERT INTO "User" (name, email, "passwordHash", role, "mustChangePassword", "isActive", "updatedAt")
     VALUES ($1, $2, $3, 'REQUESTER', false, true, now())
     ON CONFLICT (email) DO UPDATE SET "passwordHash" = $3, "isActive" = true, "mustChangePassword" = false, "updatedAt" = now()`,
    [`E2E Fixture ${email}`, email, passwordHash],
  );
}

// Every lab-02 spec file shares these two fixture accounts and calls this in its own beforeAll -
// idempotent, so whichever file runs first creates them and the rest just confirm they're ready.
// No matching teardown deletes the User rows: multiple files' Tickets end up owned by them within
// one run, and deleting mid-suite would hit the same FK constraint upsertRequester avoids. The
// accounts are permanent, clearly-marked fixtures, safe to persist between runs - the Tickets
// pointing at them are what global-teardown.ts cleans up, by E2E_MARK, once per full run.
export async function setUpE2ERequesters() {
  const client = await connect();
  try {
    await upsertRequester(client, E2E_REQUESTER_A_EMAIL);
    await upsertRequester(client, E2E_REQUESTER_B_EMAIL);
  } finally {
    await client.end();
  }
}

export async function loginAs(page: Page, email: string) {
  await page.goto('/login');
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/^password$/i).fill(E2E_REQUESTER_PASSWORD);
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForURL('**/my-tickets');
}
