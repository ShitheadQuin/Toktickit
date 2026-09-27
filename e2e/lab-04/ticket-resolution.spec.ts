import { test, expect } from '@playwright/test';
import { REQUESTER, STAFF_A, setUpActionsFixtures, signIn, signOut, tearDownActionsFixtures } from './fixtures';

// E2E-02 (AC-03): against the real app and database, the owner cannot resolve a Ticket until its
// work is recorded and finished (BR-16), neither on screen nor straight to the API; once the Action
// is Completed the Ticket resolves, and the Requester sees the Resolved status, the Actions and the
// status history.
test.describe('Ticket resolution with the resolution gate (E2E-02)', () => {
  let ticketId: number;

  test.beforeAll(async () => {
    ticketId = await setUpActionsFixtures();
  });

  test.afterAll(async () => {
    await tearDownActionsFixtures();
  });

  test('refused while work is missing or open, resolved once it is complete, visible to the Requester', async ({ page }) => {
    await signIn(page, STAFF_A.email, '/staff/queue');
    await page.goto(`/staff/tickets/${ticketId}`);
    const status = page.getByLabel('Change status');
    const resolvedOption = status.locator('option[value="RESOLVED"]');

    // No Actions yet: Resolved is disabled, and the reason is written out.
    await expect(page.getByText('Resolved is not available yet: Add and complete at least one Action first.')).toBeVisible();
    await expect(resolvedOption).toBeDisabled();

    // One Planned Action: still refused, now with the open count.
    await page.getByRole('button', { name: 'Add Action' }).click();
    const create = page.getByRole('form', { name: 'Add Action' });
    await create.getByLabel('Action Description').fill('Replace the laptop adapter');
    await create.getByRole('button', { name: 'Save Action' }).click();
    await expect(page.getByText('Resolved is not available yet: Complete or cancel the open Actions first (1 open).')).toBeVisible();

    // Bypassing the screen does not help: the backend enforces the same rule.
    const detail = await (await page.request.get(`/api/staff/tickets/${ticketId}`)).json();
    const bypass = await page.request.patch(`/api/staff/tickets/${ticketId}/status`, { data: { status: 'RESOLVED', expectedVersion: detail.version } });
    expect(bypass.status()).toBe(409);
    expect((await bypass.json()).error.code).toBe('RESOLUTION_GATE_NOT_MET');

    // Completing the Action lifts the gate.
    await page.getByRole('button', { name: 'Open action: Replace the laptop adapter' }).click();
    const edit = page.getByRole('form', { name: 'Edit Action' });
    await edit.getByLabel('Status').selectOption('COMPLETED');
    await edit.getByLabel('Result').fill('New adapter fitted; the laptop charges');
    await edit.getByRole('button', { name: 'Save Changes' }).click();
    await expect(page.getByText(/Resolved is not available yet/)).toHaveCount(0);
    await expect(resolvedOption).toBeEnabled();

    await status.selectOption('RESOLVED');
    await page.getByRole('button', { name: 'Update status' }).click();
    await expect(page.locator('.tt-badge-status-resolved').first()).toBeVisible();
    await expect(page.getByRole('region', { name: 'Status History' })).toContainText('In Progress → Resolved');
    await signOut(page);

    // The Requester sees the outcome, the work and the history.
    await signIn(page, REQUESTER.email, '/my-tickets');
    await page.goto(`/tickets/${ticketId}`);
    await expect(page.locator('.tt-badge-status-resolved').first()).toBeVisible();
    await expect(page.locator('.tt-actions-table tbody tr')).toHaveCount(1);
    await expect(page.locator('.tt-badge-action-completed')).toBeVisible();
    await expect(page.getByRole('region', { name: 'Status History' })).toContainText('In Progress → Resolved');
  });
});
