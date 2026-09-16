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

// E2E-02 (Issue #38): an IT Staff member, a Requester and one unassigned New Ticket, all dedicated
// fixtures removed again afterwards. The Ticket uses its own number rather than E2E_MARK, because
// the flow adds a Public Comment and an Internal Note, which global-teardown's Ticket delete would
// trip over (foreign keys) - so this spec removes its own rows, children first.
export const E2E_STAFF_EMAIL = 'e2e-lab3-staff-flow@toktickit.dev';
export const E2E_STAFF_NAME = 'E2E Staff Flow';
export const E2E_STAFF_PASSWORD = 'E2EStaffFlow1';
export const E2E_FLOW_REQUESTER_EMAIL = 'e2e-lab3-flow-requester@toktickit.dev';
export const E2E_FLOW_TICKET_NUMBER = 'TKT-2099-940001';

async function removeStaffFlowRows(client: Client) {
  const flowTicket = `(SELECT id FROM "Ticket" WHERE "ticketNumber" = $1)`;
  await client.query(`DELETE FROM "InternalNote" WHERE "ticketId" IN ${flowTicket}`, [E2E_FLOW_TICKET_NUMBER]);
  await client.query(`DELETE FROM "PublicComment" WHERE "ticketId" IN ${flowTicket}`, [E2E_FLOW_TICKET_NUMBER]);
  await client.query(`DELETE FROM "Ticket" WHERE "ticketNumber" = $1`, [E2E_FLOW_TICKET_NUMBER]);
  const emails = [E2E_STAFF_EMAIL, E2E_FLOW_REQUESTER_EMAIL];
  await client.query(`DELETE FROM "Session" WHERE "userId" IN (SELECT id FROM "User" WHERE email = ANY($1))`, [emails]);
  await client.query(`DELETE FROM "User" WHERE email = ANY($1)`, [emails]);
}

export async function setUpStaffFlowFixtures() {
  const client = await connect();
  try {
    await removeStaffFlowRows(client);
    const passwordHash = await bcrypt.hash(E2E_STAFF_PASSWORD, 12);
    const insertUser = `INSERT INTO "User" (name, email, "passwordHash", role, "mustChangePassword", "isActive", "updatedAt")
       VALUES ($1, $2, $3, $4, false, true, now()) RETURNING id`;
    await client.query(insertUser, [E2E_STAFF_NAME, E2E_STAFF_EMAIL, passwordHash, 'IT_STAFF']);
    const requester = await client.query(insertUser, ['E2E Flow Requester', E2E_FLOW_REQUESTER_EMAIL, passwordHash, 'REQUESTER']);

    const category = await client.query(`SELECT id FROM "Category" WHERE "isActive" ORDER BY id LIMIT 1`);
    const relatedSystem = await client.query(`SELECT id FROM "RelatedSystem" WHERE "isActive" ORDER BY id LIMIT 1`);
    await client.query(
      `INSERT INTO "Ticket" ("ticketNumber", "requesterId", "categoryId", "relatedSystemId", summary, description,
         "requestedPriority", "itPriority", "currentStatus", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $6, 'LOW', 'LOW', 'NEW', now())`,
      [
        E2E_FLOW_TICKET_NUMBER,
        requester.rows[0].id,
        category.rows[0].id,
        relatedSystem.rows[0].id,
        'E2E-02 library printer jams on duplex',
        'Fixture Ticket for the IT Staff ticket flow spec.',
      ],
    );
  } finally {
    await client.end();
  }
}

export async function tearDownStaffFlowFixtures() {
  const client = await connect();
  try {
    await removeStaffFlowRows(client);
  } finally {
    await client.end();
  }
}

// E2E-03 (Issue #39): a fixture Administrator made the only active Administrator for this spec,
// because the last-active-Administrator rule depends on that count - any other active Administrator
// is set inactive in setup and restored in teardown. Plus a Requester to edit, and cleanup of the user
// the spec creates.
export const E2E_ADMIN_EMAIL = 'e2e-lab3-admin@toktickit.dev';
export const E2E_ADMIN_PASSWORD = 'E2EAdminFlow1';
export const E2E_EDIT_TARGET_EMAIL = 'e2e-lab3-admin-edit-target@toktickit.dev';
export const E2E_CREATED_USER_EMAIL = 'e2e-lab3-admin-created@toktickit.dev';

const USER_ADMIN_EMAILS = [E2E_ADMIN_EMAIL, E2E_EDIT_TARGET_EMAIL, E2E_CREATED_USER_EMAIL];
let otherAdminIdsDeactivated: number[] = [];

async function removeUserAdminRows(client: Client) {
  await client.query(`DELETE FROM "Session" WHERE "userId" IN (SELECT id FROM "User" WHERE email = ANY($1))`, [USER_ADMIN_EMAILS]);
  await client.query(`DELETE FROM "User" WHERE email = ANY($1)`, [USER_ADMIN_EMAILS]);
}

export async function setUpUserAdminFixtures() {
  const client = await connect();
  try {
    await removeUserAdminRows(client);
    const others = await client.query(
      `UPDATE "User" SET "isActive" = false, "updatedAt" = now() WHERE role = 'ADMINISTRATOR' AND "isActive" RETURNING id`,
    );
    otherAdminIdsDeactivated = others.rows.map((row: { id: number }) => row.id);

    const passwordHash = await bcrypt.hash(E2E_ADMIN_PASSWORD, 12);
    const insertUser = `INSERT INTO "User" (name, email, "passwordHash", role, "mustChangePassword", "isActive", "updatedAt")
       VALUES ($1, $2, $3, $4, false, true, now())`;
    await client.query(insertUser, ['E2E Admin', E2E_ADMIN_EMAIL, passwordHash, 'ADMINISTRATOR']);
    await client.query(insertUser, ['E2E Edit Target', E2E_EDIT_TARGET_EMAIL, passwordHash, 'REQUESTER']);
  } finally {
    await client.end();
  }
}

// RESP-01 (Issue #40) needs an Administrator only to *look* at User Management, and must not use
// setUpUserAdminFixtures: that one deactivates every active Administrator so its own fixture is the
// last one standing, which is exactly what E2E-03's blocked-change test needs and exactly wrong for
// a screenshot - the first RESP-01 captures showed the seeded Administrator as Inactive. This
// fixture only adds a row, never changes anyone else's.
export const E2E_VIEW_ADMIN_EMAIL = 'e2e-lab3-view-admin@toktickit.dev';
export const E2E_VIEW_ADMIN_PASSWORD = 'E2EViewAdmin1';

export async function setUpViewAdminFixture() {
  const client = await connect();
  try {
    const passwordHash = await bcrypt.hash(E2E_VIEW_ADMIN_PASSWORD, 12);
    await client.query(`DELETE FROM "Session" WHERE "userId" IN (SELECT id FROM "User" WHERE email = $1)`, [E2E_VIEW_ADMIN_EMAIL]);
    await client.query(`DELETE FROM "User" WHERE email = $1`, [E2E_VIEW_ADMIN_EMAIL]);
    await client.query(
      `INSERT INTO "User" (name, email, "passwordHash", role, "mustChangePassword", "isActive", "updatedAt")
       VALUES ($1, $2, $3, 'ADMINISTRATOR', false, true, now())`,
      ['E2E View Admin', E2E_VIEW_ADMIN_EMAIL, passwordHash],
    );
  } finally {
    await client.end();
  }
}

export async function tearDownViewAdminFixture() {
  const client = await connect();
  try {
    await client.query(`DELETE FROM "Session" WHERE "userId" IN (SELECT id FROM "User" WHERE email = $1)`, [E2E_VIEW_ADMIN_EMAIL]);
    await client.query(`DELETE FROM "User" WHERE email = $1`, [E2E_VIEW_ADMIN_EMAIL]);
  } finally {
    await client.end();
  }
}

export async function tearDownUserAdminFixtures() {
  const client = await connect();
  try {
    await removeUserAdminRows(client);
    await client.query(`UPDATE "User" SET "isActive" = true, "updatedAt" = now() WHERE id = ANY($1)`, [otherAdminIdsDeactivated]);
  } finally {
    await client.end();
  }
}
