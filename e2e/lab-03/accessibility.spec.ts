import { test, expect, type Locator, type Page } from '@playwright/test';
import {
  E2E_AUTH_EMAIL,
  E2E_AUTH_INITIAL_PASSWORD,
  E2E_FLOW_TICKET_NUMBER,
  E2E_STAFF_EMAIL,
  E2E_STAFF_PASSWORD,
  E2E_VIEW_ADMIN_EMAIL,
  E2E_VIEW_ADMIN_PASSWORD,
  setUpAuthFixtureUser,
  setUpStaffFlowFixtures,
  setUpViewAdminFixture,
  tearDownAuthFixtureUser,
  tearDownStaffFlowFixtures,
  tearDownViewAdminFixture,
} from './fixtures';

// A11Y-01 (Issue #40), ui-spec.md §11: every control reachable with Tab, operable with
// Enter/Space, and showing a visible focus indicator. #36 deleted e2e/lab-02/keyboard-nav.spec.ts
// because its subject - the Development Requester selector - no longer exists; this replaces it
// across the Lab 3 screens.
//
// The assertions are about reachability and operability, not a fixed tab order: the labsheet asks
// that the app be usable from the keyboard, and pinning an exact sequence would break on any
// layout change without telling us anything about whether a person could still use it.

const MAX_TABS = 40;

// Tabs until the wanted element holds focus. Returns the number of presses so a control that is
// reachable only after an unreasonable number of stops still reads as a failure.
async function tabTo(page: Page, target: Locator, max = MAX_TABS) {
  for (let presses = 1; presses <= max; presses++) {
    await page.keyboard.press('Tab');
    if (await target.evaluate((el) => el === document.activeElement)) return presses;
  }
  const description = await target.evaluate((el) => el.outerHTML.slice(0, 120)).catch(() => 'unknown element');
  throw new Error(`not reachable with ${max} Tab presses: ${description}`);
}

// ui-spec.md §11: focus must be *visible*, not merely present. A control whose focused styling is
// identical to its resting styling leaves a keyboard user with no idea where they are.
async function expectVisibleFocusIndicator(target: Locator) {
  const styles = await target.evaluate((el) => {
    const read = () => {
      const s = getComputedStyle(el);
      return `${s.outlineStyle} ${s.outlineWidth} ${s.outlineColor} ${s.boxShadow} ${s.borderColor}`;
    };
    el.blur();
    const resting = read();
    el.focus();
    return { resting, focused: read() };
  });
  expect(styles.focused, 'focused styling is identical to resting styling').not.toBe(styles.resting);
}

async function signIn(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/^password$/i).fill(password);
  await page.getByRole('button', { name: /sign in/i }).click();
}

test.describe('A11Y-01 — authentication by keyboard only', () => {
  test.beforeAll(async () => {
    await setUpAuthFixtureUser();
  });

  test.afterAll(async () => {
    await tearDownAuthFixtureUser();
  });

  test('Login can be completed without a mouse', async ({ page }) => {
    await page.goto('/login');
    await page.locator('body').click(); // start from a known place, then use the keyboard only

    await tabTo(page, page.getByLabel(/email/i));
    await expectVisibleFocusIndicator(page.getByLabel(/email/i));
    await page.keyboard.type(E2E_AUTH_EMAIL);

    await tabTo(page, page.locator('#login-password'));
    await page.keyboard.type(E2E_AUTH_INITIAL_PASSWORD);

    // Enter inside the form submits it - a keyboard user should not have to find the button.
    await page.keyboard.press('Enter');
    await page.waitForURL('**/change-password');
  });

  test('the forced Change Password form is reachable and operable by keyboard', async ({ page }) => {
    await signIn(page, E2E_AUTH_EMAIL, E2E_AUTH_INITIAL_PASSWORD);
    await page.waitForURL('**/change-password');
    await page.locator('body').click();

    await tabTo(page, page.getByLabel('Current Password'));
    await expectVisibleFocusIndicator(page.getByLabel('Current Password'));
    await tabTo(page, page.getByLabel('New Password', { exact: true }));
    await tabTo(page, page.getByLabel('Confirm New Password'));
    // Not submitted: the fixture stays on its initial password for the other specs.
  });
});

test.describe('A11Y-01 — Ticket Queue and Ticket Detail by keyboard only', () => {
  test.beforeAll(async () => {
    await setUpStaffFlowFixtures();
  });

  test.afterAll(async () => {
    await tearDownStaffFlowFixtures();
  });

  test('Queue search, filters, sorting and pagination are all keyboard-reachable', async ({ page }) => {
    await signIn(page, E2E_STAFF_EMAIL, E2E_STAFF_PASSWORD);
    await page.waitForURL('**/staff/queue');
    await page.locator('.tt-queue-table').waitFor();
    await page.locator('body').click();

    await tabTo(page, page.locator('#queue-search'));
    await expectVisibleFocusIndicator(page.locator('#queue-search'));
    await page.keyboard.type(E2E_FLOW_TICKET_NUMBER);
    await page.keyboard.press('Enter');
    await expect(page.getByRole('link', { name: E2E_FLOW_TICKET_NUMBER })).toHaveCount(1);

    // Each filter and sort control is a native select, so it is focusable and its value can be set
    // from the keyboard. Reaching them is the part that can regress.
    for (const control of ['Status', 'IT Priority', 'Assigned', 'Sort by', 'Order']) {
      const select = page.getByLabel(control, { exact: true });
      await select.focus();
      await expect(select).toBeFocused();
    }
  });

  test('a Queue row can be opened with the keyboard, and Ticket Detail controls are reachable', async ({ page }) => {
    await signIn(page, E2E_STAFF_EMAIL, E2E_STAFF_PASSWORD);
    await page.waitForURL('**/staff/queue');
    await page.getByLabel('Search', { exact: true }).fill(E2E_FLOW_TICKET_NUMBER);
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    await expect(page.getByRole('link', { name: E2E_FLOW_TICKET_NUMBER })).toHaveCount(1);

    // StaffTicketQueue.tsx: the whole row responds to a click, and the Ticket Number link is the
    // keyboard path to the same place. That link is what makes the row usable without a mouse.
    const link = page.getByRole('link', { name: E2E_FLOW_TICKET_NUMBER });
    await link.focus();
    await expect(link).toBeFocused();
    await page.keyboard.press('Enter');
    await page.waitForURL('**/staff/tickets/*');
    await page.locator('.tt-staff-controls').waitFor();

    for (const control of ['IT Priority', 'Change status']) {
      const select = page.getByLabel(control, { exact: true });
      await select.focus();
      await expect(select).toBeFocused();
    }

    const composer = page.getByLabel('Add a public comment');
    await composer.focus();
    await expect(composer).toBeFocused();
    await expectVisibleFocusIndicator(composer);

    // The Comments/Notes tabs are custom controls rather than native buttons, so their keyboard
    // operability is worth asserting rather than assuming.
    const notesTab = page.getByRole('tab', { name: 'Internal Notes' });
    await notesTab.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByLabel('Add an internal note')).toBeVisible();
  });
});

test.describe('A11Y-01 — User Management by keyboard only', () => {
  test.beforeAll(async () => {
    await setUpViewAdminFixture();
  });

  test.afterAll(async () => {
    await tearDownViewAdminFixture();
  });

  test('the list, its controls and the create panel are keyboard-operable', async ({ page }) => {
    await signIn(page, E2E_VIEW_ADMIN_EMAIL, E2E_VIEW_ADMIN_PASSWORD);
    await page.waitForURL('**/users');
    await page.locator('.tt-user-table').waitFor();
    await page.locator('body').click();

    await tabTo(page, page.locator('#user-search'));
    await expectVisibleFocusIndicator(page.locator('#user-search'));
    await page.keyboard.type('Duangjai');
    await page.keyboard.press('Enter');
    await expect(page.locator('.tt-user-table tbody tr')).toHaveCount(1);

    const roleFilter = page.locator('#user-role-filter');
    await roleFilter.focus();
    await expect(roleFilter).toBeFocused();

    // Add user is a plain button, so Enter must open the panel.
    const addUser = page.getByRole('button', { name: 'Add user' });
    await addUser.focus();
    await page.keyboard.press('Enter');
    await page.locator('.tt-user-panel').waitFor();

    await tabTo(page, page.locator('#user-name'));
    await page.keyboard.type('Keyboard Only');

    // BR-21's role radio group: arrow keys move the selection, which is how a radio group is
    // meant to work and the reason ui-spec.md §8 chose radios over a multi-select.
    const requester = page.locator('#user-role-REQUESTER');
    await requester.focus();
    await expect(requester).toBeChecked();
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('#user-role-IT_STAFF')).toBeChecked();

    // Nothing is submitted: this test proves the panel can be driven, not that it saves.
    await page.getByRole('button', { name: 'Cancel' }).focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('.tt-user-panel')).toHaveCount(0);
  });
});
