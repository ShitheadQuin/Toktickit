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

for (const [viewportName, size] of Object.entries(VIEWPORTS)) {
  test.describe(`Responsive — ${viewportName}`, () => {
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

    test(`Ticket Detail at ${viewportName}`, async ({ page }) => {
      await selectFirstRequester(page);

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
      // Waits for the filtered row itself, not just "Search" resolving - at mobile widths the
      // unfiltered 10-row list can still satisfy getByRole('link', { name: 'Open' }) before the
      // debounced re-fetch lands, matching the wrong Ticket's Open link.
      await page.getByText(summary).waitFor({ state: 'visible' });
      await page.getByRole('link', { name: 'Open' }).click();

      await assertNoHorizontalOverflow(page);
      await page.screenshot({
        path: `../artifacts/lab-02/screenshots/ticket-detail/${viewportName}.png`,
        fullPage: true,
      });
    });
  });
}
