import { test, expect, type Page } from '@playwright/test';

// E2E-01/02/03 (Issue #17): the full Requester ticket flow against the real app - real dev
// servers, real Postgres, no mocked fetches, unlike the Vitest UI suites in client/tests.

async function requesterOptions(page: Page): Promise<{ value: string; label: string }[]> {
  await page.goto('/');
  await page.locator('#requester-select').waitFor({ state: 'visible' });
  await expect(page.locator('#requester-select')).toBeEnabled();
  return page.locator('#requester-select option[value]:not([value=""])').evaluateAll((options) =>
    options.map((option) => ({
      value: (option as HTMLOptionElement).value,
      label: option.textContent ?? '',
    })),
  );
}

async function selectRequester(page: Page, value: string) {
  await page.goto('/');
  await page.locator('#requester-select').waitFor({ state: 'visible' });
  await expect(page.locator('#requester-select')).toBeEnabled();
  await page.selectOption('#requester-select', value);
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.waitForURL('**/my-tickets');
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
  // E2E-01 - AC-01, AC-07: select a Requester, create a Ticket, find it in My Tickets
  test('a created Ticket appears in the creating Requester’s My Tickets', async ({ page }) => {
    const [requesterA] = await requesterOptions(page);
    await selectRequester(page, requesterA.value);

    const summary = `Playwright E2E-01 ${Date.now()}`;
    const ticketNumber = await createTicket(page, summary);

    await page.goto('/my-tickets');
    await page.getByLabel('Search').fill(ticketNumber);
    await page.getByRole('button', { name: 'Search' }).click();

    await expect(page.getByText(ticketNumber)).toBeVisible();
  });

  // E2E-02 - AC-03, AC-15: another Requester cannot see or directly open the Ticket
  test('another Requester cannot find the Ticket or open it directly (BR-08, BR-22)', async ({ page }) => {
    const options = await requesterOptions(page);
    test.skip(options.length < 2, 'Needs at least two active Requesters seeded.');
    const [requesterA, requesterB] = options;

    await selectRequester(page, requesterA.value);
    const summary = `Playwright E2E-02 ${Date.now()}`;
    const ticketNumber = await createTicket(page, summary);

    await page.goto('/my-tickets');
    await page.getByLabel('Search').fill(ticketNumber);
    await page.getByRole('button', { name: 'Search' }).click();
    await page.getByRole('link', { name: 'Open' }).click();
    const url = page.url();
    const ticketId = url.split('/tickets/')[1];

    // Switch to Requester B.
    await page.getByRole('button', { name: 'Change Requester' }).click();
    await selectRequester(page, requesterB.value);

    await page.getByLabel('Search').fill(ticketNumber);
    await page.getByRole('button', { name: 'Search' }).click();
    await expect(page.getByText(/no tickets match/i)).toBeVisible();

    await page.goto(`/tickets/${ticketId}`);
    await expect(page.getByText(/don't have access/i)).toBeVisible();
    await expect(page.getByText(summary)).not.toBeVisible();
  });

  // E2E-03 - AC-22, AC-23, AC-24: add an attachment, soft-remove it, then attempt to download it
  test('an attachment can be added, then soft-removed, then blocked from download', async ({ page }) => {
    const [requesterA] = await requesterOptions(page);
    await selectRequester(page, requesterA.value);

    const summary = `Playwright E2E-03 ${Date.now()}`;
    await createTicket(page, summary);

    await page.goto('/my-tickets');
    await page.getByLabel('Search').fill(summary);
    await page.getByRole('button', { name: 'Search' }).click();
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
