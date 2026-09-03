import path from 'node:path';
import dotenv from 'dotenv';
import { Client } from 'pg';
import { E2E_MARK } from './lab-02/fixtures';

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
  } finally {
    await client.end();
  }
}
