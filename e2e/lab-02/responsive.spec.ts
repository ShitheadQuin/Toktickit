import { test, expect, type Page } from '@playwright/test';
import { E2E_MARK } from './fixtures';

// RESP-01 (Issue #17): screenshots at desktop/tablet/mobile for Create Ticket, My Tickets and
// Ticket Detail, per labsheet §12. Every screenshot also gets one automated check - no
// horizontal overflow - since that alone is objectively measurable; the rest of ui-spec.md §16's
// visual checklist (clipping, overlap, inconsistent field styling) is confirmed by eye against
// the saved images, not something a script can reliably judge.

const VIEWPORTS = {
  desktop: { width: 1280, height: 900 },
  tablet: { width: 768, height: 1024 },
  mobile: { width: 375, height: 812 },
} as const;

async function selectFirstRequester(page: Page) {
  await page.goto('/');
  await page.locator('#requester-select').waitFor({ state: 'visible' });
  await expect(page.locator('#requester-select')).toBeEnabled();
  const value = await page.locator('#requester-select option[value]:not([value=""])').first().getAttribute('value');
  await page.selectOption('#requester-select', value!);
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.waitForURL('**/my-tickets');
}

async function assertNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1); // sub-pixel rounding tolerance only
}

// Every list screenshot is taken before any viewport's Ticket Detail test runs. The detail test
// has to create a Ticket to open, and Playwright runs tests in file order - so interleaving them
// per viewport put this suite's own fixture Tickets at the top of the later My Tickets captures,
// which is exactly what that evidence must not show.
for (const [viewportName, size] of Object.entries(VIEWPORTS)) {
  test.describe(`Responsive — ${viewportName} — list screens`, () => {
    test.use({ viewport: size });

    test(`Create Ticket at ${viewportName}`, async ({ page }) => {
      await selectFirstRequester(page);
      await page.goto('/create-ticket');
      await assertNoHorizontalOverflow(page);
      await page.screenshot({
        path: `../artifacts/lab-02/screenshots/create-ticket/${viewportName}.png`,
        fullPage: true,
      });
    });

    test(`My Tickets at ${viewportName}`, async ({ page }) => {
      await selectFirstRequester(page);
      await page.goto('/my-tickets');
      await page.waitForLoadState('networkidle');
      await assertNoHorizontalOverflow(page);
      await page.screenshot({
        path: `../artifacts/lab-02/screenshots/my-tickets/${viewportName}.png`,
        fullPage: true,
      });
    });
  });
}

for (const [viewportName, size] of Object.entries(VIEWPORTS)) {
  test.describe(`Responsive — ${viewportName} — Ticket Detail`, () => {
    test.use({ viewport: size });

    test(`Ticket Detail at ${viewportName}`, async ({ page }) => {
      await selectFirstRequester(page);
      await page.goto('/my-tickets');
      await page.waitForLoadState('networkidle');

      // Opens one of the Requester's real Tickets when there is one, so this evidence shows a
      // realistic Ticket rather than a fixture summary. Only falls back to creating one when the
      // Requester owns nothing, which keeps the suite self-sufficient on an empty database.
      if ((await page.getByRole('link', { name: 'Open' }).count()) === 0) {
        const summary = `${E2E_MARK} RESP-01 ${viewportName} ${Date.now()}`;
        await page.goto('/create-ticket');
        await page.getByLabel('Category').selectOption({ index: 1 });
        await page.getByLabel('Related System').selectOption({ index: 1 });
        await page.getByLabel('Summary').fill(summary);
        await page.getByLabel('Description').fill('Fixture Ticket for the RESP-01 responsive screenshot suite.');
        await page.getByLabel('Requested Priority').selectOption('MEDIUM');
        await page.getByRole('button', { name: 'Submit' }).click();
        await expect(page.getByText(/TKT-\d{4}-\d{6}/)).toBeVisible({ timeout: 15_000 });

        await page.goto('/my-tickets');
        await page.getByLabel('Search').fill(summary);
        await page.getByRole('button', { name: 'Search' }).click();
        await page.getByText(summary).waitFor({ state: 'visible' });
      }

      await page.getByRole('link', { name: 'Open' }).first().click();
      // The click alone does not settle the navigation, so without waiting for the detail screen
      // itself the screenshot captures the list it just left.
      await page.waitForURL('**/tickets/**');
      await page.locator('input#ticketNumber').waitFor({ state: 'visible' });

      await assertNoHorizontalOverflow(page);
      await page.screenshot({
        path: `../artifacts/lab-02/screenshots/ticket-detail/${viewportName}.png`,
        fullPage: true,
      });
    });
  });
}
