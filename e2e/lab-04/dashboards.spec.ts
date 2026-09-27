import { test, expect } from '@playwright/test';
import { REQUESTER, STAFF_A, TICKET_NUMBER, setUpActionsFixtures, signIn, signOut, tearDownActionsFixtures } from './fixtures';

// E2E-03 (AC-02, AC-21, AC-24): against the real app and database, each role lands on its own
// dashboard, the figures are the server's, and following a card opens the list it counted, with a
// total equal to the card.
test.describe('Role dashboards (E2E-03)', () => {
  test.beforeAll(async () => {
    await setUpActionsFixtures();
  });

  test.afterAll(async () => {
    await tearDownActionsFixtures();
  });

  test('the Requester lands on a dashboard of their own Tickets, and a card opens the matching list', async ({ page }) => {
    await signIn(page, REQUESTER.email, '/dashboard');
    await expect(page.getByRole('heading', { name: 'Welcome, E2E' })).toBeVisible();

    // The fixture Requester owns exactly one Ticket, In Progress.
    const myOpen = page.getByRole('link', { name: 'My Open Tickets: 1, view list' });
    await expect(myOpen).toBeVisible();
    await expect(page.getByRole('link', { name: 'Closed: 0, view list' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'My Recent Tickets' }).getByRole('link', { name: TICKET_NUMBER })).toBeVisible();

    await myOpen.click();
    await page.waitForURL('**/my-tickets?statusGroup=active');
    await expect(page.getByText('Active statuses')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Open', exact: true })).toHaveCount(1);
    await signOut(page);
  });

  test('IT Staff land on the Staff dashboard, and every card total equals the list it opens', async ({ page }) => {
    await signIn(page, STAFF_A.email, '/dashboard');
    await expect(page.getByRole('heading', { name: 'Welcome, E2E' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'By Status' })).toBeVisible();

    // AC-21 and AC-24: each figure against the list its link opens, read through the same session.
    const cards = page.locator('a.tt-metric-card');
    await expect(cards).toHaveCount(3);
    for (let i = 0; i < 3; i++) {
      const card = cards.nth(i);
      const count = Number(await card.locator('.tt-metric-count').innerText());
      const href = (await card.getAttribute('href'))!;
      const list = await (await page.request.get(`/api/staff/tickets?${href.split('?')[1]}`)).json();
      expect(list.totalCount, href).toBe(count);
    }

    // My Tickets: the fixture Ticket is owned by Staff A and In Progress.
    await page.getByRole('link', { name: /^My Tickets: \d+, view list$/ }).click();
    await page.waitForURL(/\/staff\/queue\?owner=\d+&statusGroup=active$/);
    await expect(page.locator('#queue-assigned')).toHaveValue('me');
    await expect(page.getByRole('link', { name: TICKET_NUMBER })).toBeVisible();
  });
});
