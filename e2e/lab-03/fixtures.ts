import path from 'node:path';
import dotenv from 'dotenv';
import { Client } from 'pg';
import bcrypt from 'bcryptjs';

// Same convention as e2e/lab-02/fixtures.ts's E2E_MARK, but for a dedicated User row rather than
// a Ticket: a self-contained fixture, never a real seeded account, so this spec cannot consume
// the "spare account" the plan's screenshot evidence needs, and cannot pollute the throttle or
// mustChangePassword state of a shared seeded user.
export const E2E_AUTH_EMAIL = 'e2e-lab3-auth-test@toktickit.dev';
export const E2E_AUTH_INITIAL_PASSWORD = 'InitialPass1';

async function connect() {
  dotenv.config({ path: path.join(__dirname, '..', '..', 'server', '.env') });
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  return client;
}

// Creates (or resets) the fixture User with mustChangePassword = true, ready for the forced
// first-login flow. Run before the test, not in a shared global setup - this spec's own describe
// owns the account's lifecycle end to end.
export async function setUpAuthFixtureUser() {
  const client = await connect();
  try {
    const passwordHash = await bcrypt.hash(E2E_AUTH_INITIAL_PASSWORD, 12);
    await client.query(`DELETE FROM "Session" WHERE "userId" IN (SELECT id FROM "User" WHERE email = $1)`, [E2E_AUTH_EMAIL]);
    await client.query(`DELETE FROM "User" WHERE email = $1`, [E2E_AUTH_EMAIL]);
    await client.query(
      `INSERT INTO "User" (name, email, "passwordHash", role, "mustChangePassword", "isActive", "updatedAt")
       VALUES ($1, $2, $3, 'IT_STAFF', true, true, now())`,
      ['E2E Auth Fixture', E2E_AUTH_EMAIL, passwordHash],
    );
  } finally {
    await client.end();
  }
}

export async function tearDownAuthFixtureUser() {
  const client = await connect();
  try {
    await client.query(`DELETE FROM "Session" WHERE "userId" IN (SELECT id FROM "User" WHERE email = $1)`, [E2E_AUTH_EMAIL]);
    await client.query(`DELETE FROM "User" WHERE email = $1`, [E2E_AUTH_EMAIL]);
  } finally {
    await client.end();
  }
}
