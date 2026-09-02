import { test, expect, type Page } from '@playwright/test';
import { E2E_MARK } from './fixtures';

// STYLE-01/02 (Issue #17): automated assertions for the required CSS classes, field states and
// button behavior documented in ui-spec.md §18, against the real rendered app.

async function selectFirstRequester(page: Page) {
  await page.goto('/');
  await page.locator('#requester-select').waitFor({ state: 'visible' });
  await expect(page.locator('#requester-select')).toBeEnabled();
  const value = await page.locator('#requester-select option[value]:not([value=""])').first().getAttribute('value');
  await page.selectOption('#requester-select', value!);
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.waitForURL('**/my-tickets');
}

test.describe('UI style — Create Ticket (STYLE-01, ui-spec.md 18)', () => {
  test.beforeEach(async ({ page }) => {
    await selectFirstRequester(page);
    await page.goto('/create-ticket');
  });

  test('required field labels carry .tt-required with a visible asterisk', async ({ page }) => {
    for (const label of ['Category', 'Related System', 'Summary', 'Description', 'Requested Priority']) {
      const locator = page.locator('label.tt-required', { hasText: label });
      await expect(locator).toHaveCount(1);
    }
    // ui-spec.md 18: the asterisk is CSS ::after content, not a literal text node.
    const summaryLabel = page.locator('label.tt-required', { hasText: 'Summary' });
    await expect(summaryLabel).not.toHaveText(/\*/);
    const pseudoContent = await summaryLabel.evaluate(
      (el) => getComputedStyle(el, '::after').content,
    );
    expect(pseudoContent).toContain('*');
  });

  test('read-only system-generated fields carry .tt-field-readonly and the readonly attribute', async ({ page }) => {
    for (const id of ['#requester', '#ticketNumber', '#ticketDate']) {
      const field = page.locator(id);
      await expect(field).toHaveClass(/tt-field-readonly/);
      await expect(field).toHaveAttribute('readonly', '');
    }
  });

  test('an invalid field on submit gets .is-invalid and an .invalid-feedback message', async ({ page }) => {
    await page.getByRole('button', { name: 'Submit' }).click();

    const summaryField = page.getByLabel('Summary');
    await expect(summaryField).toHaveClass(/is-invalid/);
    const feedback = page.locator('#summary ~ .invalid-feedback, .invalid-feedback', { hasText: /summary/i });
    await expect(feedback.first()).toBeVisible();
  });

  test('the primary Submit button carries its documented class', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Submit' })).toHaveClass(/btn-tt-primary/);
  });

  test('the tertiary Remove-attachment button carries its documented class', async ({ page }) => {
    await page.getByLabel('Attachments').setInputFiles({
      name: 'style-check.png',
      mimeType: 'image/png',
      buffer: Buffer.from('style check fixture'),
    });
    await expect(page.getByRole('button', { name: 'Remove' })).toHaveClass(/btn-tt-tertiary/);
  });

  test('the secondary Change Requester button carries its documented class', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Change Requester' })).toHaveClass(/btn-tt-secondary/);
  });

  test('Submit shows the busy .tt-busy state and is disabled while the request is in flight', async ({ page }) => {
    // PR #30 review: local Postgres answers so fast that the very first assertion poll after
    // click() can already lose the race against the response landing and the screen switching
    // to success - delaying just the create-Ticket response, not any other request, makes the
    // busy window long enough to observe deterministically rather than by luck.
    await page.route('**/api/tickets', async (route) => {
      if (route.request().method() === 'POST') {
        await new Promise((resolve) => setTimeout(resolve, 800));
      }
      await route.continue();
    });

    await page.getByLabel('Category').selectOption({ index: 1 });
    await page.getByLabel('Related System').selectOption({ index: 1 });
    await page.getByLabel('Summary').fill(`${E2E_MARK} STYLE-01 busy-state ${Date.now()}`);
    await page.getByLabel('Description').fill('Checking the busy button state per ui-spec.md 18.');
    await page.getByLabel('Requested Priority').selectOption('LOW');

    const submit = page.getByRole('button', { name: /submit/i });
    await submit.click();
    // PR #30 review: React flushes setSubmitting(true) before the fetch it triggers can resolve,
    // so the busy class and disabled attribute are already on the button the instant click()
    // returns - asserted here before waiting for the (already in-flight) request to complete.
    await expect(submit).toHaveClass(/tt-busy/);
    await expect(submit).toBeDisabled();
    await expect(page.getByText(/TKT-\d{4}-\d{6}/)).toBeVisible({ timeout: 15_000 });
  });
});

test.describe('UI style — My Tickets badges (STYLE-02, ui-spec.md 12)', () => {
  test('Requested Priority and Current Status badges carry their documented classes and always show their word', async ({ page }) => {
    await selectFirstRequester(page);

    // Each summary carries this run's own timestamp, so a row lookup by its exact summary text
    // never collides with a fixture Ticket left behind by an earlier run of this same suite.
    const summaries: Record<'LOW' | 'MEDIUM' | 'HIGH', string> = { LOW: '', MEDIUM: '', HIGH: '' };

    for (const priority of ['LOW', 'MEDIUM', 'HIGH'] as const) {
      const summary = `${E2E_MARK} STYLE-02 ${priority} ${Date.now()}`;
      summaries[priority] = summary;

      await page.goto('/create-ticket');
      await page.getByLabel('Category').selectOption({ index: 1 });
      await page.getByLabel('Related System').selectOption({ index: 1 });
      await page.getByLabel('Summary').fill(summary);
      await page.getByLabel('Description').fill('Checking badge classes per ui-spec.md 12.');
      await page.getByLabel('Requested Priority').selectOption(priority);
      await page.getByRole('button', { name: 'Submit' }).click();
      await expect(page.getByText(/TKT-\d{4}-\d{6}/)).toBeVisible({ timeout: 15_000 });
    }

    await page.goto('/my-tickets');
    await page.getByLabel('Search').fill('STYLE-02');
    await page.getByRole('button', { name: 'Search' }).click();
    await page.waitForSelector('table');

    for (const [priority, cssSuffix] of [['LOW', 'low'], ['MEDIUM', 'medium'], ['HIGH', 'high']] as const) {
      const row = page.locator('tr', { hasText: summaries[priority] });
      const badge = row.locator(`.tt-badge-priority-${cssSuffix}`);
      await expect(badge).toBeVisible();
      // ui-spec.md 9/12: color is never the only cue - the word itself is always present too.
      await expect(badge).toHaveText(new RegExp(priority === 'LOW' ? 'Low' : priority === 'MEDIUM' ? 'Medium' : 'High', 'i'));

      const statusBadge = row.locator('.tt-badge-status-new');
      await expect(statusBadge).toBeVisible();
      await expect(statusBadge).toHaveText(/new/i);
    }
  });
});
