import { test, expect, type Page } from '@playwright/test';
import { REQUESTER, STAFF_A, STAFF_B, setActive, setUpActionsFixtures, signIn, signOut, tearDownActionsFixtures } from './fixtures';

// E2E-01 (AC-01, AC-06, AC-09): against the real app and database, two IT Staff members record
// Actions on one Ticket owned by the first, an inactive assignee is refused, Actions are moved to
// In Progress, Completed and Cancelled, and the Requester then sees every Action read-only.
test.describe('Actions Taken flow (E2E-01)', () => {
  let ticketId: number;

  test.beforeAll(async () => {
    ticketId = await setUpActionsFixtures();
  });

  test.afterAll(async () => {
    await tearDownActionsFixtures();
  });

  async function addAction(page: Page, description: string, assignee: string) {
    await page.getByRole('button', { name: 'Add Action' }).click();
    const form = page.getByRole('form', { name: 'Add Action' });
    await form.getByLabel('Action Description').fill(description);
    await form.getByLabel('Assignee').selectOption({ label: assignee });
    await form.getByRole('button', { name: 'Save Action' }).click();
    return form;
  }

  test('several staff members record, assign, complete and cancel Actions; the Requester sees them all', async ({ page }) => {
    // Staff B, who does not own the Ticket, records an Action for Staff A (BR-02).
    await signIn(page, STAFF_B.email, '/staff/queue');
    await page.goto(`/staff/tickets/${ticketId}`);
    await addAction(page, 'Tested the adapter with a meter', STAFF_A.name);
    await expect(page.getByRole('status').filter({ hasText: 'Action saved.' })).toBeVisible();
    await signOut(page);

    // Staff A, the owner, records one for Staff B.
    await signIn(page, STAFF_A.email, '/staff/queue');
    await page.goto(`/staff/tickets/${ticketId}`);
    await addAction(page, 'Order a replacement adapter', STAFF_B.name);
    await expect(page.getByRole('status').filter({ hasText: 'Action saved.' })).toBeVisible();

    // AC-06: Staff B becomes inactive while the form is open; the server refuses the assignment.
    await page.getByRole('button', { name: 'Add Action' }).click();
    const form = page.getByRole('form', { name: 'Add Action' });
    await form.getByLabel('Action Description').fill('Swap the battery');
    await form.getByLabel('Assignee').selectOption({ label: STAFF_B.name });
    await setActive(STAFF_B.email, false);
    await form.getByRole('button', { name: 'Save Action' }).click();
    await expect(form.getByText('This person is inactive and cannot be assigned an Action.')).toBeVisible();
    await expect(form.getByLabel('Action Description')).toHaveValue('Swap the battery');
    await form.getByLabel('Assignee').selectOption({ label: STAFF_A.name });
    await form.getByRole('button', { name: 'Save Action' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Action saved.' })).toBeVisible();
    await setActive(STAFF_B.email, true);

    // Edit: the first Action moves to In Progress, then to Completed with a result.
    await page.getByRole('button', { name: 'Open action: Tested the adapter with a meter' }).click();
    let edit = page.getByRole('form', { name: 'Edit Action' });
    await edit.getByLabel('Status').selectOption('IN_PROGRESS');
    await edit.getByRole('button', { name: 'Save Changes' }).click();
    await expect(page.locator('.tt-badge-action-in-progress')).toBeVisible();

    await page.getByRole('button', { name: 'Open action: Tested the adapter with a meter' }).click();
    edit = page.getByRole('form', { name: 'Edit Action' });
    await edit.getByLabel('Status').selectOption('COMPLETED');
    await edit.getByRole('button', { name: 'Save Changes' }).click();
    await expect(edit.getByText('Result is required when the Action is Completed.')).toBeVisible();
    await edit.getByLabel('Result').fill('Adapter gives no output; the adapter is faulty');
    await edit.getByRole('button', { name: 'Save Changes' }).click();
    await expect(page.locator('.tt-badge-action-completed')).toHaveCount(1);

    // A Completed Action opens read-only.
    await page.getByRole('button', { name: 'Open action: Tested the adapter with a meter' }).click();
    await expect(page.getByRole('form', { name: 'View Action' }).getByText('Completed Actions cannot be changed.')).toBeVisible();
    await page.getByRole('form', { name: 'View Action' }).getByRole('button', { name: 'Close' }).click();

    // Cancel asks first, then locks the Action.
    await page.getByRole('button', { name: 'Open action: Swap the battery' }).click();
    edit = page.getByRole('form', { name: 'Edit Action' });
    await edit.getByLabel('Status').selectOption('CANCELLED');
    await edit.getByRole('button', { name: 'Save Changes' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Confirm' }).click();
    await expect(page.locator('.tt-badge-action-cancelled')).toHaveCount(1);

    // AC-09: three Actions on one Ticket, each with its own performer, in time order.
    const rows = page.locator('.tt-actions-table tbody tr');
    await expect(rows).toHaveCount(3);
    await expect(rows.nth(0)).toContainText(STAFF_B.name);
    await expect(rows.nth(1)).toContainText(STAFF_A.name);
    await signOut(page);

    // AC-05: the Requester sees every Action, Cancelled included, with nothing to change them.
    await signIn(page, REQUESTER.email, '/my-tickets');
    await page.goto(`/tickets/${ticketId}`);
    await expect(page.locator('.tt-actions-table tbody tr')).toHaveCount(3);
    await expect(page.locator('.tt-badge-action-cancelled')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add Action' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Open action/ })).toHaveCount(0);
  });
});
