import { test, expect, type Page } from '@playwright/test';
import { E2E_MARK } from './fixtures';
import { E2E_REQUESTER_A_EMAIL, loginAs, setUpE2ERequesters } from './auth-helper';

// RESP-01 (Issue #17): Create Ticket, My Tickets and Ticket Detail at desktop/tablet/mobile, each
// checked for horizontal overflow - the one part of ui-spec.md §16's visual checklist a script can
// reliably judge.
// #36: logs in as a real session-based Requester instead of the removed selector, and no longer
// writes screenshots. artifacts/lab-02/screenshots/ holds the captures Lab 2 was submitted with;
// re-running this spec against the Lab 3 shell would overwrite that record. Lab 3's own captures
// go to artifacts/lab-03/screenshots/ (Issue #40).

test.beforeAll(async () => {
  await setUpE2ERequesters();
});

const VIEWPORTS = {
  desktop: { width: 1280, height: 900 },
  tablet: { width: 768, height: 1024 },
  mobile: { width: 375, height: 812 },
} as const;

async function assertNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1); // sub-pixel rounding tolerance only
}

// Every list screen is checked before any viewport's Ticket Detail test runs. The detail test may
// have to create a Ticket to open, and Playwright runs tests in file order - so this keeps the list
// checks running against the Requester's real Tickets rather than this suite's own fixtures.
for (const [viewportName, size] of Object.entries(VIEWPORTS)) {
  test.describe(`Responsive — ${viewportName} — list screens`, () => {
    test.use({ viewport: size });

    test(`Create Ticket at ${viewportName}`, async ({ page }) => {
      await loginAs(page, E2E_REQUESTER_A_EMAIL);
      await page.goto('/create-ticket');
      await assertNoHorizontalOverflow(page);
    });

    test(`My Tickets at ${viewportName}`, async ({ page }) => {
      await loginAs(page, E2E_REQUESTER_A_EMAIL);
      await page.goto('/my-tickets');
      await page.waitForLoadState('networkidle');
      await assertNoHorizontalOverflow(page);
    });
  });
}

for (const [viewportName, size] of Object.entries(VIEWPORTS)) {
  test.describe(`Responsive — ${viewportName} — Ticket Detail`, () => {
    test.use({ viewport: size });

    test(`Ticket Detail at ${viewportName}`, async ({ page }) => {
      await loginAs(page, E2E_REQUESTER_A_EMAIL);
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
    });
  });
}
