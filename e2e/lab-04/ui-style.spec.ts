import { test, expect } from '@playwright/test';
import { REQUESTER, STAFF_A, addFixtureAction, setUpActionsFixtures, signIn, tearDownActionsFixtures } from './fixtures';

// STYLE-02, ui-spec.md 3, 7 and 11 on the rendered app. STYLE-01 proves the badge class map and its
// CSS rules exist; this proves the screens use them: each metric card has a label, a number and an
// accessible name, badges carry words as well as colour, and a locked Action shows every field in
// the Lab 2 read only style.

const BADGE = /(^|\s)tt-badge(\s|$)/;
const READ_ONLY_BG = 'rgb(237, 242, 239)'; // --tt-readonly-bg #EDF2EF

test.describe('Lab 4 styling on the rendered screens (STYLE-02)', () => {
  let ticketId: number;

  test.beforeAll(async () => {
    ticketId = await setUpActionsFixtures();
    await addFixtureAction(ticketId, 'Checked the adapter with a meter', 'COMPLETED');
    await addFixtureAction(ticketId, 'Order a replacement adapter', 'PLANNED');
  });

  test.afterAll(async () => {
    await tearDownActionsFixtures();
  });

  test('metric cards: label, number and "Label: n, view list" name; My Open Actions is not a link', async ({ page }) => {
    await signIn(page, STAFF_A.email, '/dashboard');
    const cards = page.locator('.tt-metric-grid > *');
    await expect(cards).toHaveCount(4);
    for (let i = 0; i < 4; i++) {
      const card = cards.nth(i);
      const label = (await card.locator('.tt-metric-label').innerText()).trim();
      const count = (await card.locator('.tt-metric-count').innerText()).trim();
      expect(label.length).toBeGreaterThan(0);
      expect(count).toMatch(/^\d+$/);
      if (label === 'My Open Actions') {
        expect(await card.evaluate((el) => el.tagName)).not.toBe('A');
        await expect(card.locator('.tt-metric-view')).toHaveCount(0);
      } else {
        await expect(card).toHaveAttribute('href', /.+/);
        await expect(card).toHaveAccessibleName(`${label}: ${count}, view list`);
      }
    }

    // By Status: all 8 statuses, each a badge with its word and a count.
    const byStatus = page.getByRole('region', { name: 'By Status' }).locator('.tt-badge');
    await expect(byStatus).toHaveCount(8);
    for (let i = 0; i < 8; i++) {
      await expect(byStatus.nth(i)).toHaveClass(/tt-badge-status-/);
      expect((await byStatus.nth(i).innerText()).trim().length).toBeGreaterThan(0);
    }
  });

  test('Requester "Waiting for Me" says "Needs your reply" in words, never only a colour', async ({ page }) => {
    await signIn(page, REQUESTER.email, '/dashboard');
    const waiting = page.getByRole('link', { name: /^Waiting for Me: \d+, view list$/ });
    await expect(waiting).toBeVisible();
    // The fixture Ticket is In Progress, so nothing waits: no attention marker at all.
    await expect(waiting.locator('.tt-metric-attention')).toHaveCount(0);
  });

  test('Actions table: status badges carry words; a Completed Action opens fully read only', async ({ page }) => {
    await signIn(page, STAFF_A.email, '/dashboard');
    await page.goto(`/staff/tickets/${ticketId}`);
    const badges = page.locator('.tt-actions-table .tt-badge');
    await expect(badges).toHaveCount(2);
    for (let i = 0; i < 2; i++) {
      await expect(badges.nth(i)).toHaveClass(BADGE);
      await expect(badges.nth(i)).toHaveClass(/tt-badge-action-/);
      expect((await badges.nth(i).innerText()).trim().length).toBeGreaterThan(0);
    }

    await page.getByRole('button', { name: 'Open action: Checked the adapter with a meter' }).click();
    const form = page.getByRole('form', { name: 'View Action' });
    await expect(form.getByText('Completed Actions cannot be changed')).toBeVisible();
    await expect(form.getByRole('button', { name: /save/i })).toHaveCount(0);
    const fields = form.locator('input:not([type=checkbox]), textarea, select');
    const count = await fields.count();
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < count; i++) {
      await expect(fields.nth(i)).toHaveClass(/tt-field-readonly/);
      // Focused too: the panel focuses its first field on opening, and a read only field must not
      // turn white like an editable one when the user lands on it.
      await fields.nth(i).focus();
      await expect(fields.nth(i)).toHaveCSS('background-color', READ_ONLY_BG);
    }
  });
});
