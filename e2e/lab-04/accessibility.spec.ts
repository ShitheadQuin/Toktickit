import { test, expect, type Locator, type Page } from '@playwright/test';
import { STAFF_A, addFixtureAction, setUpActionsFixtures, signIn, tearDownActionsFixtures } from './fixtures';

// A11Y-01 (AC-28), ui-spec.md 13: keyboard only. Dashboard cards and links are reachable with a
// visible focus ring and follow on Enter; the Action panel opens from the keyboard with focus on its
// first field, saves, and hands focus back to Add Action; the status control is reachable; and the
// confirm dialog opens on Go back, keeps Tab inside and closes with Escape. Same approach as Lab 3's
// e2e/lab-03/accessibility.spec.ts: reachability and operability, not a fixed tab order.

const MAX_TABS = 60;

async function tabTo(page: Page, target: Locator, max = MAX_TABS) {
  for (let presses = 1; presses <= max; presses++) {
    await page.keyboard.press('Tab');
    if (await target.evaluate((el) => el === document.activeElement)) return presses;
  }
  const description = await target.evaluate((el) => el.outerHTML.slice(0, 120)).catch(() => 'unknown element');
  throw new Error(`not reachable with ${max} Tab presses: ${description}`);
}

async function expectVisibleFocusIndicator(target: Locator) {
  const styles = await target.evaluate((el) => {
    const read = () => {
      const s = getComputedStyle(el);
      return `${s.outlineStyle} ${s.outlineWidth} ${s.outlineColor} ${s.boxShadow} ${s.borderColor}`;
    };
    (el as HTMLElement).blur();
    const resting = read();
    (el as HTMLElement).focus();
    return { resting, focused: read() };
  });
  expect(styles.focused, 'focused styling is identical to resting styling').not.toBe(styles.resting);
}

const isFocused = (target: Locator) => target.evaluate((el) => el === document.activeElement);

test.describe('Lab 4 screens by keyboard only (A11Y-01)', () => {
  let ticketId: number;

  test.beforeAll(async () => {
    ticketId = await setUpActionsFixtures();
    await addFixtureAction(ticketId, 'Order a replacement adapter', 'PLANNED');
  });

  test.afterAll(async () => {
    await tearDownActionsFixtures();
  });

  test('dashboard cards are reachable, visibly focused, and follow on Enter', async ({ page }) => {
    await signIn(page, STAFF_A.email, '/dashboard');
    await page.locator('.tt-metric-count').first().waitFor();
    await page.locator('body').click();

    const myTickets = page.getByRole('link', { name: /^My Tickets: \d+, view list$/ });
    await tabTo(page, myTickets);
    await expectVisibleFocusIndicator(myTickets);
    const byStatus = page.getByRole('region', { name: 'By Status' }).getByRole('link').first();
    await tabTo(page, byStatus);
    await expectVisibleFocusIndicator(byStatus);

    await myTickets.focus();
    await page.keyboard.press('Enter');
    await page.waitForURL(/\/staff\/queue\?owner=\d+&statusGroup=active$/);
  });

  test('the Action panel opens, saves and closes from the keyboard, with focus where ui-spec 13 puts it', async ({ page }) => {
    await signIn(page, STAFF_A.email, '/dashboard');
    await page.goto(`/staff/tickets/${ticketId}`);
    const addAction = page.getByRole('button', { name: 'Add Action' });
    await addAction.waitFor();
    await page.locator('body').click();

    await tabTo(page, addAction);
    await expectVisibleFocusIndicator(addAction);
    await page.keyboard.press('Enter');
    const form = page.getByRole('form', { name: 'Add Action' });
    await expect(form.locator('#action-at')).toBeFocused();

    await tabTo(page, form.getByLabel('Action Description'));
    await page.keyboard.type('Reseated the charging port');
    await tabTo(page, form.getByRole('button', { name: 'Save Action' }));
    await page.keyboard.press('Enter');
    await expect(page.getByRole('status').filter({ hasText: 'Action saved.' })).toBeVisible();
    await expect(form).toHaveCount(0);
    await expect.poll(() => isFocused(addAction)).toBe(true);

    const status = page.getByLabel('Change status', { exact: true });
    await tabTo(page, status);
    await expectVisibleFocusIndicator(status);
  });

  test('the Cancel Action confirm dialog keeps focus inside and closes with Escape', async ({ page }) => {
    await signIn(page, STAFF_A.email, '/dashboard');
    await page.goto(`/staff/tickets/${ticketId}`);
    const open = page.getByRole('button', { name: 'Open action: Order a replacement adapter' });
    await open.focus();
    await page.keyboard.press('Enter');
    const form = page.getByRole('form', { name: 'Edit Action' });
    await form.getByLabel(/^Status/).selectOption('CANCELLED');
    const save = form.getByRole('button', { name: 'Save Changes' });
    await save.focus();
    await page.keyboard.press('Enter');

    const dialog = page.getByRole('dialog', { name: 'Cancel this Action?' });
    const goBack = dialog.getByRole('button', { name: 'Go back' });
    await expect(goBack).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(dialog.getByRole('button', { name: 'Confirm' })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(goBack).toBeFocused();

    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(save).toBeFocused();
    await expect(page.getByRole('button', { name: 'Open action: Order a replacement adapter' })).toBeVisible();
  });
});
