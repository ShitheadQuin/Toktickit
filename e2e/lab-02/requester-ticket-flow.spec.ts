import { test, expect, type Page } from '@playwright/test';
import { E2E_MARK } from './fixtures';
import { E2E_REQUESTER_A_EMAIL, E2E_REQUESTER_B_EMAIL, loginAs, setUpE2ERequesters } from './auth-helper';

// E2E-01/02/03 (Issue #17): the full Requester ticket flow against the real app - real dev
// servers, real Postgres, no mocked fetches, unlike the Vitest UI suites in client/tests.
// #36: logs in as a real session-based Requester instead of the removed Development Requester
// selector.

async function logout(page: Page) {
  await page.getByRole('button', { name: /logout/i }).click();
  await page.waitForURL('**/login');
}

async function createTicket(page: Page, summary: string): Promise<string> {
  await page.goto('/create-ticket');
  await page.getByLabel('Category').selectOption({ index: 1 });
  await page.getByLabel('Related System').selectOption({ index: 1 });
  await page.getByLabel('Summary').fill(summary);
  await page.getByLabel('Description').fill('Created by the Playwright requester-ticket-flow E2E suite.');
  await page.getByLabel('Requested Priority').selectOption('MEDIUM');
  await page.getByRole('button', { name: 'Submit' }).click();

  // The success paragraph reads "Ticket Number: TKT-2026-000110" as one text node - pull out
  // just the code, not the label, so it can be used verbatim as a search term afterward.
  const paragraphText = await page.getByText(/TKT-\d{4}-\d{6}/).textContent();
  const match = paragraphText?.match(/TKT-\d{4}-\d{6}/);
  if (!match) throw new Error(`Could not find a Ticket Number in: ${paragraphText}`);
  return match[0];
}

test.describe('Requester ticket flow', () => {
  test.beforeAll(async () => {
    await setUpE2ERequesters();
  });

  // E2E-01 - AC-01, AC-07: log in, create a Ticket, find it in My Tickets
  test('a created Ticket appears in the creating Requester’s My Tickets', async ({ page }) => {
    await loginAs(page, E2E_REQUESTER_A_EMAIL);

    const summary = `${E2E_MARK} E2E-01 ${Date.now()}`;
    const ticketNumber = await createTicket(page, summary);

    await page.goto('/my-tickets');
    await page.getByLabel('Search').fill(ticketNumber);
    await page.getByRole('button', { name: 'Search' }).click();

    await expect(page.getByText(ticketNumber)).toBeVisible();
  });

  // E2E-02 - AC-03, AC-09/BR-12: another Requester cannot see or directly open the Ticket
  test('another Requester cannot find the Ticket or open it directly (BR-08, BR-12)', async ({ page }) => {
    await loginAs(page, E2E_REQUESTER_A_EMAIL);
    const summary = `${E2E_MARK} E2E-02 ${Date.now()}`;
    const ticketNumber = await createTicket(page, summary);

    await page.goto('/my-tickets');
    await page.getByLabel('Search').fill(ticketNumber);
    await page.getByRole('button', { name: 'Search' }).click();
    // Waits for the filtered row itself, not just Search resolving - the unfiltered list can still
    // satisfy getByRole('link', { name: 'Open' }) before the re-fetch lands, which would open the
    // wrong Ticket and silently test the wrong id below. Same fix as responsive.spec.ts.
    await page.getByText(ticketNumber).waitFor({ state: 'visible' });
    // #40: the summary turning visible is not the same as the old rows leaving - the search result
    // paints while the previous page of rows is still in the table, so Open matched several links
    // and strict mode failed intermittently. One table, one Open link per row (MyTickets.tsx), so
    // waiting for exactly one is waiting for the list to have finished redrawing.
    await expect(page.getByRole('link', { name: 'Open' })).toHaveCount(1);
    await page.getByRole('link', { name: 'Open' }).click();
    await page.waitForURL('**/tickets/**');
    const url = page.url();
    const ticketId = url.split('/tickets/')[1];

    // Switch to Requester B - a real logout/login, since identity is now a real session. B is a
    // fresh fixture that owns no Tickets at all, so My Tickets correctly shows the true empty
    // state (search controls only render once there is something to search - ui-spec.md 13),
    // not a searchable list with A's Ticket absent from it.
    await logout(page);
    await loginAs(page, E2E_REQUESTER_B_EMAIL);
    await expect(page.getByText(/haven't created any tickets yet/i)).toBeVisible();
    await expect(page.getByText(ticketNumber)).not.toBeVisible();

    // BR-12 (Lab 3): a Ticket that belongs to someone else is indistinguishable from one that
    // doesn't exist - the same "does not exist" message the Lab 2 not-found case showed.
    await page.goto(`/tickets/${ticketId}`);
    await expect(page.getByText(/does not exist/i)).toBeVisible();
    await expect(page.getByText(summary)).not.toBeVisible();
  });

  // E2E-03 - AC-22, AC-23, AC-24: add an attachment, soft-remove it, then attempt to download it
  test('an attachment can be added, then soft-removed, then blocked from download', async ({ page }) => {
    await loginAs(page, E2E_REQUESTER_A_EMAIL);

    const summary = `${E2E_MARK} E2E-03 ${Date.now()}`;
    await createTicket(page, summary);

    await page.goto('/my-tickets');
    await page.getByLabel('Search').fill(summary);
    await page.getByRole('button', { name: 'Search' }).click();
    // Same wait as E2E-02: an unfiltered or still-empty list must not satisfy the Open link, and
    // exactly one Open link means the filtered list has finished redrawing (#40).
    await page.getByText(summary).waitFor({ state: 'visible' });
    await expect(page.getByRole('link', { name: 'Open' })).toHaveCount(1);
    await page.getByRole('link', { name: 'Open' }).click();

    await page.getByLabel('Add attachment').setInputFiles({
      name: 'e2e-fixture.png',
      mimeType: 'image/png',
      buffer: Buffer.from('e2e fixture png bytes'),
    });

    const attachmentRow = page.locator('.tt-attachment-row', { hasText: 'e2e-fixture.png' });
    const downloadLink = attachmentRow.getByRole('link', { name: 'Download' });
    await expect(downloadLink).toBeVisible({ timeout: 15_000 });
    const downloadHref = await downloadLink.getAttribute('href');

    await attachmentRow.getByRole('button', { name: 'Remove' }).click();
    await attachmentRow.getByLabel('Reason for removal').fill('Playwright E2E-03 cleanup');
    await attachmentRow.getByRole('button', { name: 'Confirm Remove' }).click();

    await expect(page.getByText(/e2e-fixture\.png — Removed/)).toBeVisible();
    await expect(page.getByRole('link', { name: 'Download' })).not.toBeVisible();

    // BR-16: a removed attachment's download is blocked, indistinguishable from a missing one.
    const response = await page.request.get(downloadHref!);
    expect(response.status()).toBe(404);
  });
});
