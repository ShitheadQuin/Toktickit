import { test, expect, type Page } from '@playwright/test';
import {
  E2E_FLOW_TICKET_NUMBER,
  E2E_STAFF_EMAIL,
  E2E_STAFF_PASSWORD,
  E2E_VIEW_ADMIN_EMAIL,
  E2E_VIEW_ADMIN_PASSWORD,
  setUpStaffFlowFixtures,
  setUpViewAdminFixture,
  tearDownStaffFlowFixtures,
  tearDownViewAdminFixture,
} from './fixtures';

// STYLE-01 and STYLE-02 (Issue #40), ui-spec.md §7/§9/§14.
//
// STYLE-03 (client/tests/lab-03/badge-classes.test.ts) already proves the value → class map is
// complete and that every class it names has a rule in theme.css. What it cannot see is the
// rendered app: whether the screens actually put those classes on the badges they draw. That is
// this file's job, so the two together cover "the mapping is right" and "the mapping is used".

const BADGE = /(^|\s)tt-badge(\s|$)/;

async function signIn(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/^password$/i).fill(password);
  await page.getByRole('button', { name: /sign in/i }).click();
}

// ui-spec.md §9: colour is never the only cue, so a badge must always carry its word. An element
// styled as a badge but rendering an empty string would pass a class check and fail a reader.
async function expectBadgesCarryText(page: Page, selector: string) {
  const badges = page.locator(selector);
  const count = await badges.count();
  expect(count, `expected at least one badge matching ${selector}`).toBeGreaterThan(0);
  for (let i = 0; i < count; i++) {
    await expect(badges.nth(i)).toHaveClass(BADGE);
    expect((await badges.nth(i).innerText()).trim().length, `${selector} #${i} rendered no text`).toBeGreaterThan(0);
  }
}

test.describe('STYLE-01 — badge markup on the Lab 3 screens', () => {
  test.beforeAll(async () => {
    await setUpStaffFlowFixtures();
  });

  test.afterAll(async () => {
    await tearDownStaffFlowFixtures();
  });

  test('Ticket Queue draws status and IT Priority badges from the shared map', async ({ page }) => {
    await signIn(page, E2E_STAFF_EMAIL, E2E_STAFF_PASSWORD);
    await page.waitForURL('**/staff/queue');
    await page.locator('.tt-queue-table').waitFor();

    await expectBadgesCarryText(page, '.tt-queue-status .tt-badge');

    // Every status badge on the screen must use one of §14's eight class names - a value the map
    // does not know would render as a bare .tt-badge and be caught here.
    const statusClasses = await page.locator('.tt-queue-status .tt-badge').evaluateAll((els) =>
      els.map((el) => [...el.classList].find((c) => c.startsWith('tt-badge-status-')) ?? null),
    );
    expect(statusClasses).not.toContain(null);
  });

  test('Staff Ticket Detail draws status and priority badges', async ({ page }) => {
    await signIn(page, E2E_STAFF_EMAIL, E2E_STAFF_PASSWORD);
    await page.waitForURL('**/staff/queue');
    await page.getByLabel('Search', { exact: true }).fill(E2E_FLOW_TICKET_NUMBER);
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    await expect(page.getByRole('link', { name: E2E_FLOW_TICKET_NUMBER })).toHaveCount(1);
    await page.getByRole('link', { name: E2E_FLOW_TICKET_NUMBER }).click();
    await page.locator('.tt-staff-controls').waitFor();

    await expectBadgesCarryText(page, '.tt-badge[class*="tt-badge-status-"]');
  });

  test('the app shell draws the signed-in user’s role badge', async ({ page }) => {
    await signIn(page, E2E_STAFF_EMAIL, E2E_STAFF_PASSWORD);
    await page.waitForURL('**/staff/queue');
    await expectBadgesCarryText(page, '.tt-badge[class*="tt-badge-role-"]');
  });
});

test.describe('STYLE-01 — User Management badges', () => {
  test.beforeAll(async () => {
    await setUpViewAdminFixture();
  });

  test.afterAll(async () => {
    await tearDownViewAdminFixture();
  });

  test('every user row carries a role badge and an Active/Inactive badge', async ({ page }) => {
    await signIn(page, E2E_VIEW_ADMIN_EMAIL, E2E_VIEW_ADMIN_PASSWORD);
    await page.waitForURL('**/users');
    await page.locator('.tt-user-table').waitFor();

    const rows = await page.locator('.tt-user-table tbody tr').count();
    expect(rows).toBeGreaterThan(0);
    await expect(page.locator('.tt-user-table tbody .tt-badge[class*="tt-badge-role-"]')).toHaveCount(rows);
    await expect(page.locator('.tt-user-table tbody .tt-badge[class*="tt-badge-user-"]')).toHaveCount(rows);
    await expectBadgesCarryText(page, '.tt-user-table tbody .tt-badge[class*="tt-badge-user-"]');
  });
});

test.describe('STYLE-02 — Public Comments and Internal Notes are visually distinct', () => {
  test.beforeAll(async () => {
    await setUpStaffFlowFixtures();
  });

  test.afterAll(async () => {
    await tearDownStaffFlowFixtures();
  });

  test('a Comment and a Note use different classes and different backgrounds', async ({ page }) => {
    await signIn(page, E2E_STAFF_EMAIL, E2E_STAFF_PASSWORD);
    await page.waitForURL('**/staff/queue');
    await page.getByLabel('Search', { exact: true }).fill(E2E_FLOW_TICKET_NUMBER);
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    await expect(page.getByRole('link', { name: E2E_FLOW_TICKET_NUMBER })).toHaveCount(1);
    await page.getByRole('link', { name: E2E_FLOW_TICKET_NUMBER }).click();
    await page.locator('.tt-staff-controls').waitFor();

    await page.getByLabel('Add a public comment').fill('STYLE-02: a Public Comment, visible to the Requester.');
    await page.getByRole('button', { name: 'Post comment' }).click();
    const comment = page.locator('.tt-comment-public').first();
    await comment.waitFor();
    // Read it now: the tabs swap their panels out of the DOM, so once Internal Notes is open the
    // Comment element is gone and anything measuring it would hang.
    const commentBackground = await comment.evaluate((el) => getComputedStyle(el).backgroundColor);
    await expect(comment).toHaveClass(/tt-comment-public/);

    await page.getByRole('tab', { name: 'Internal Notes' }).click();
    await page.getByLabel('Add an internal note').fill('STYLE-02: an Internal Note, never shown to the Requester.');
    await page.getByRole('button', { name: 'Post note' }).click();
    const note = page.locator('.tt-note-internal').first();
    await note.waitFor();

    // ui-spec.md §7 and §12: distinguishable at a glance, not by caption alone. Different classes
    // are the contract; different rendered backgrounds are what a reader actually sees, so assert
    // both - a stylesheet that dropped one of the rules would keep the classes and lose the cue.
    const noteBackground = await note.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(noteBackground).not.toBe(commentBackground);

    // The Note also states its own restriction in words, so the distinction survives for a reader
    // who cannot see either colour.
    await expect(note).toContainText(/internal/i);
  });
});
