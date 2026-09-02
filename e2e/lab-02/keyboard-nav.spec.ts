import { test, expect } from '@playwright/test';

// UI-02 (Issue #12 gap, closed out here per LAB2_PLAN.md) - AC-26: the Requester selector must
// be fully usable with the keyboard alone. PR #30 review: every step below is a key press, not
// a programmatic Playwright call standing in for one - selectOption() is not a key press, and
// the ArrowDown that followed it in the earlier version silently moved the selection again.
test('RequesterSelector is fully operable by keyboard alone (AC-26)', async ({ page }) => {
  await page.goto('/');
  const select = page.locator('#requester-select');
  await select.waitFor({ state: 'visible' });
  await expect(select).toBeEnabled();

  // Tab from the top of the page to the select without ever clicking.
  await page.keyboard.press('Tab');
  while (!(await select.evaluate((el) => el === document.activeElement))) {
    await page.keyboard.press('Tab');
  }
  await expect(select).toBeFocused();

  // ArrowDown from the disabled placeholder lands on the first real option; a second ArrowDown
  // moves to the second Requester - native <select> keyboard nav skips disabled options itself.
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');

  const selectedValue = await select.inputValue();
  const selectedLabel = await page
    .locator(`#requester-select option[value="${selectedValue}"]`)
    .textContent();
  expect(selectedValue).not.toBe('');

  const continueButton = page.getByRole('button', { name: 'Continue' });
  await page.keyboard.press('Tab');
  await expect(continueButton).toBeFocused();
  await expect(continueButton).toBeEnabled();

  await page.keyboard.press('Enter');
  await page.waitForURL('**/my-tickets');

  // Proves the keyboard-driven choice, not just focus order, is what got submitted.
  await expect(page.getByText(selectedLabel!.trim())).toBeVisible();
  await expect(page.getByRole('link', { name: 'My Tickets' })).toBeVisible();
});
