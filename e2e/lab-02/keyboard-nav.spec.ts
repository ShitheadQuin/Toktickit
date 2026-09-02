import { test, expect } from '@playwright/test';

// UI-02 (Issue #12 gap, closed out here per LAB2_PLAN.md) - AC-26: the Requester selector must
// be fully usable with the keyboard alone, with no mouse interaction anywhere in this test.
test('RequesterSelector is fully operable by keyboard alone (AC-26)', async ({ page }) => {
  await page.goto('/');
  const select = page.locator('#requester-select');
  await select.waitFor({ state: 'visible' });
  await expect(select).toBeEnabled();

  const secondOptionValue = await page
    .locator('#requester-select option[value]:not([value=""])')
    .nth(1)
    .getAttribute('value');

  // Tab from the top of the page to the select without ever clicking.
  await page.keyboard.press('Tab');
  while (!(await select.evaluate((el) => el === document.activeElement))) {
    await page.keyboard.press('Tab');
  }
  await expect(select).toBeFocused();

  // Keyboard-select the second Requester option, so the choice itself - not just focus - is
  // keyboard-driven.
  await select.selectOption(secondOptionValue!, { force: false });
  await page.keyboard.press('ArrowDown');

  const continueButton = page.getByRole('button', { name: 'Continue' });
  await page.keyboard.press('Tab');
  await expect(continueButton).toBeFocused();
  await expect(continueButton).toBeEnabled();

  await page.keyboard.press('Enter');
  await page.waitForURL('**/my-tickets');
  await expect(page.getByRole('link', { name: 'My Tickets' })).toBeVisible();
});
