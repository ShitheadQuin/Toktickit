import path from 'node:path';
import dotenv from 'dotenv';
import { Client } from 'pg';
import { E2E_MARK } from './lab-02/fixtures';
import { E2E_REQUESTER_A_EMAIL, E2E_REQUESTER_B_EMAIL } from './lab-02/auth-helper';

// PR #30 review, item 3: every spec creates real Tickets against the real dev database and none
// of them cleaned up, so repeated runs were piling "Playwright E2E-01 …" rows into the Part 7
// My Tickets screenshots. This deletes every Ticket (and its Attachments, for the FK) whose
// Summary carries this run's E2E_MARK - never anything a human or another suite created.
export default async function globalTeardown() {
  dotenv.config({ path: path.join(__dirname, '..', 'server', '.env') });

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query(
      `DELETE FROM "Attachment" WHERE "ticketId" IN (SELECT id FROM "Ticket" WHERE summary LIKE $1)`,
      [`${E2E_MARK}%`],
    );
    const result = await client.query(`DELETE FROM "Ticket" WHERE summary LIKE $1`, [`${E2E_MARK}%`]);
    console.log(`[global-teardown] removed ${result.rowCount} fixture Ticket(s) marked ${E2E_MARK}`);

    // #40: the two lab-02 fixture Requesters have no teardown of their own, and for a good reason -
    // auth-helper.ts explains that several spec files share the row while their Tickets reference
    // it, so deleting mid-suite would violate the FK. But they were never removed at the *end* of a
    // run either, so they accumulated in the real User table and turned up in the Part 8 User
    // Management evidence alongside the seeded accounts. Here, after the marked Tickets are gone,
    // is the one point where removing them is safe. A fixture that still owns something unmarked is
    // left alone and reported rather than force-deleted.
    for (const email of [E2E_REQUESTER_A_EMAIL, E2E_REQUESTER_B_EMAIL]) {
      const owned = await client.query(`SELECT count(*)::int AS count FROM "Ticket" WHERE "requesterId" = (SELECT id FROM "User" WHERE email = $1)`, [email]);
      if (owned.rows[0].count > 0) {
        console.log(`[global-teardown] kept ${email}: still owns ${owned.rows[0].count} Ticket(s) this run did not mark`);
        continue;
      }
      await client.query(`DELETE FROM "Session" WHERE "userId" IN (SELECT id FROM "User" WHERE email = $1)`, [email]);
      const removed = await client.query(`DELETE FROM "User" WHERE email = $1`, [email]);
      if (removed.rowCount) console.log(`[global-teardown] removed fixture User ${email}`);
    }
  } finally {
    await client.end();
  }
}
