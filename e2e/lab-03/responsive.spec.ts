import path from 'node:path';
import { test, expect, type Page } from '@playwright/test';
import {
  E2E_ADMIN_EMAIL,
  E2E_ADMIN_PASSWORD,
  E2E_AUTH_EMAIL,
  E2E_AUTH_INITIAL_PASSWORD,
  E2E_FLOW_TICKET_NUMBER,
  E2E_STAFF_EMAIL,
  E2E_STAFF_PASSWORD,
  setUpAuthFixtureUser,
  setUpStaffFlowFixtures,
  setUpUserAdminFixtures,
  tearDownAuthFixtureUser,
  tearDownStaffFlowFixtures,
  tearDownUserAdminFixtures,
} from './fixtures';

// RESP-01 (AC-24, Issue #40): every Lab 3 screen at desktop, tablet and mobile, checked for
// horizontal overflow and captured into artifacts/lab-03/screenshots/ - the four folders labsheet
// §12 names. e2e/lab-02/responsive.spec.ts stopped writing its own captures in #36 so that Lab 2's
// submitted evidence stays as it was; this spec takes over the job for Lab 3's screens.
//
// deviceScaleFactor 2 renders at twice the resolution without changing the layout, which is what
// makes the PNGs readable at §14's "without extreme zoom" while still laying out as the declared
// breakpoint (ui-spec.md §11: desktop ≥992, tablet 768-991, mobile <768).

const VIEWPORTS = {
  desktop: { width: 1280, height: 900 },
  tablet: { width: 768, height: 1024 },
  mobile: { width: 375, height: 812 },
} as const;

const SHOTS = path.join(__dirname, '..', '..', 'artifacts', 'lab-03', 'screenshots');

async function assertNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1); // sub-pixel rounding tolerance only
}

// Captures the screen and asserts the one part of ui-spec.md §12's checklist a script can judge
// reliably. Playwright creates the folder, so the four §12 directories appear on first run.
async function capture(page: Page, group: string, name: string) {
  await page.waitForLoadState('networkidle');
  await assertNoHorizontalOverflow(page);
  await page.mouse.move(0, 0);
  await page.screenshot({ path: path.join(SHOTS, group, `${name}.png`), fullPage: true });
}

async function signIn(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/^password$/i).fill(password);
  await page.getByRole('button', { name: /sign in/i }).click();
}

test.beforeAll(async () => {
  await setUpAuthFixtureUser();
  await setUpStaffFlowFixtures();
  await setUpUserAdminFixtures();
});

test.afterAll(async () => {
  await tearDownUserAdminFixtures();
  await tearDownStaffFlowFixtures();
  await tearDownAuthFixtureUser();
});

for (const [viewportName, size] of Object.entries(VIEWPORTS)) {
  test.describe(`Responsive — ${viewportName}`, () => {
    test.use({ viewport: size, deviceScaleFactor: 2 });

    test(`Login and Change Password at ${viewportName}`, async ({ page }) => {
      await page.goto('/login');
      await capture(page, 'authentication', `login-${viewportName}`);

      // The fixture account is seeded with mustChangePassword = true and this test never submits
      // the form, so the forced-change screen stays reachable for the next viewport's run.
      await signIn(page, E2E_AUTH_EMAIL, E2E_AUTH_INITIAL_PASSWORD);
      await page.waitForURL('**/change-password');
      await capture(page, 'authentication', `change-password-${viewportName}`);
    });

    test(`Staff Ticket Queue at ${viewportName}`, async ({ page }) => {
      await signIn(page, E2E_STAFF_EMAIL, E2E_STAFF_PASSWORD);
      await page.waitForURL('**/staff/queue');
      // ui-spec.md §6: the 7-column table becomes stacked cards below 992px rather than a
      // horizontally scrolling table, so this shot is the evidence for both layouts.
      await capture(page, 'staff-queue', viewportName);
    });

    test(`Staff Ticket Detail at ${viewportName}`, async ({ page }) => {
      await signIn(page, E2E_STAFF_EMAIL, E2E_STAFF_PASSWORD);
      await page.waitForURL('**/staff/queue');

      await page.getByLabel('Search', { exact: true }).fill(E2E_FLOW_TICKET_NUMBER);
      await page.getByRole('button', { name: 'Search', exact: true }).click();
      // Same reasoning as the #40 fix in e2e/lab-02/requester-ticket-flow.spec.ts: the filtered
      // result paints while the previous rows are still there, so wait for the list to settle to
      // exactly one before opening it.
      await expect(page.getByRole('link', { name: E2E_FLOW_TICKET_NUMBER })).toHaveCount(1);
      await page.getByRole('link', { name: E2E_FLOW_TICKET_NUMBER }).click();
      await page.waitForURL('**/staff/tickets/*');
      await page.locator('.tt-staff-controls').waitFor();
      await capture(page, 'staff-ticket-detail', viewportName);
    });

    test(`User Management at ${viewportName}`, async ({ page }) => {
      await signIn(page, E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD);
      await page.waitForURL('**/users');
      await page.locator('.tt-user-table').waitFor();
      await capture(page, 'user-management', viewportName);

      // ui-spec.md §8/§11: the create panel sits beside the list on desktop and becomes a
      // full-width sheet on mobile, so the panel open is its own responsive case.
      await page.getByRole('button', { name: 'Add user' }).click();
      await page.locator('.tt-user-panel').waitFor();
      await capture(page, 'user-management', `${viewportName}-panel-open`);
    });
  });
}
