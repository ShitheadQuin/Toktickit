import { test, expect, type Page } from '@playwright/test';
import { REQUESTER, STAFF_A, setUpActionsFixtures, signIn, tearDownActionsFixtures } from './fixtures';
import { E2E_VIEW_ADMIN_EMAIL, E2E_VIEW_ADMIN_PASSWORD, setUpViewAdminFixture, tearDownViewAdminFixture } from '../lab-03/fixtures';

// HARD-01 (AC-29), labsheet 8.5 and ui-spec.md 14: every screen a role can reach loads with no
// console error or warning, no internal link on it leads nowhere, no placeholder text is left, and
// an unknown address shows not-found feedback instead of a blank page.

const PLACEHOLDER = /lorem ipsum|\bTODO\b|\bTBD\b|coming soon|placeholder|not implemented/i;

function watchConsole(page: Page) {
  const problems: string[] = [];
  page.on('console', (message) => {
    if (message.type() !== 'error' && message.type() !== 'warning') return;
    const where = message.location().url;
    // The one expected entry: before sign-in the login page asks /api/auth/me, which answers 401 by
    // the Lab 3 contract, and the browser itself logs every 401 response. The app logs nothing.
    if (where.endsWith('/api/auth/me') && page.url().endsWith('/login') && message.text().includes('401')) return;
    problems.push(`${message.type()}: ${message.text()} (${where} on ${page.url()})`);
  });
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
  return problems;
}

// Loads each screen, then follows one in-app link of every kind found on them (Ticket numbers and
// ids folded together, so /staff/tickets/7 and /staff/tickets/8 count as one kind).
async function sweep(page: Page, screens: string[]) {
  const kinds = new Map<string, string>();
  for (const screen of screens) {
    await page.goto(screen);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).not.toContainText(PLACEHOLDER);
    for (const href of await page.locator('a[href^="/"]').evaluateAll((as) => as.map((a) => a.getAttribute('href')!))) {
      const kind = href.replace(/\d+/g, 'n');
      if (!href.startsWith('/api/') && !kinds.has(kind)) kinds.set(kind, href);
    }
  }
  for (const href of kinds.values()) {
    await page.goto(href);
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { name: 'Page not found' }), `link ${href} leads nowhere`).toHaveCount(0);
    await expect(page.locator('body')).not.toContainText(PLACEHOLDER);
  }
}

test.describe('Final hardening sweep (HARD-01)', () => {
  test.setTimeout(120_000);

  let ticketId: number;

  test.beforeAll(async () => {
    ticketId = await setUpActionsFixtures();
  });

  test.afterAll(async () => {
    await tearDownActionsFixtures();
  });

  test('Requester screens: no console problems, broken links or placeholder text', async ({ page }) => {
    const problems = watchConsole(page);
    await signIn(page, REQUESTER.email, '/dashboard');
    await sweep(page, ['/dashboard', '/my-tickets', '/create-ticket', `/tickets/${ticketId}`]);
    expect(problems).toEqual([]);
  });

  test('IT Staff screens: no console problems, broken links or placeholder text', async ({ page }) => {
    const problems = watchConsole(page);
    await signIn(page, STAFF_A.email, '/dashboard');
    await sweep(page, ['/dashboard', '/staff/queue', `/staff/tickets/${ticketId}`]);
    expect(problems).toEqual([]);
  });

  test('Administrator screens: no console problems, broken links or placeholder text', async ({ page }) => {
    await setUpViewAdminFixture();
    try {
      const problems = watchConsole(page);
      await page.goto('/login');
      await page.getByLabel(/email/i).fill(E2E_VIEW_ADMIN_EMAIL);
      await page.getByLabel(/^password$/i).fill(E2E_VIEW_ADMIN_PASSWORD);
      await page.getByRole('button', { name: /sign in/i }).click();
      await page.waitForURL('**/dashboard');
      await sweep(page, ['/dashboard', '/staff/queue', `/staff/tickets/${ticketId}`, '/users']);
      expect(problems).toEqual([]);
    } finally {
      await tearDownViewAdminFixture();
    }
  });

  test('an unknown address shows not-found feedback with a way back, and no console warning', async ({ page }) => {
    const problems = watchConsole(page);
    await signIn(page, STAFF_A.email, '/dashboard');
    await page.goto('/no-such-page');
    await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
    await page.getByRole('link', { name: 'Back to Dashboard' }).click();
    await page.waitForURL('**/dashboard');
    expect(problems).toEqual([]);
  });
});
