import { test, expect } from '@playwright/test';
import {
  E2E_FLOW_TICKET_NUMBER,
  E2E_STAFF_EMAIL,
  E2E_STAFF_NAME,
  E2E_STAFF_PASSWORD,
  setUpStaffFlowFixtures,
  tearDownStaffFlowFixtures,
} from './fixtures';

// E2E-02 (AC-11, AC-13, AC-15, AC-16): an IT Staff member finds an unassigned Ticket in the Queue,
// claims it, sets IT Priority, posts a Public Comment and an Internal Note, and moves it through the
// permitted status workflow - including a confirmed Reopen (BR-18) - against the real app and database.
test.describe('IT Staff ticket flow (E2E-02)', () => {
  test.beforeAll(async () => {
    await setUpStaffFlowFixtures();
  });

  test.afterAll(async () => {
    await tearDownStaffFlowFixtures();
  });

  test('claim, IT Priority, comment, note and status workflow end to end', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel(/email/i).fill(E2E_STAFF_EMAIL);
    await page.getByLabel(/^password$/i).fill(E2E_STAFF_PASSWORD);
    await page.getByRole('button', { name: /sign in/i }).click();
    await page.waitForURL('**/staff/queue');

    // Find the Ticket in the Queue and open it.
    await page.getByLabel('Search', { exact: true }).fill(E2E_FLOW_TICKET_NUMBER);
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    await page.getByRole('link', { name: E2E_FLOW_TICKET_NUMBER }).click();
    await page.waitForURL('**/staff/tickets/*');
    const ticketId = new URL(page.url()).pathname.split('/').pop();

    // AC-11: claiming makes the caller the owner and opens the Ticket.
    await page.getByRole('button', { name: 'Claim', exact: true }).click();
    await expect(page.getByRole('status')).toHaveText('Ticket claimed.');
    await expect(page.locator('.tt-badge-status-open')).toBeVisible();

    await page.getByLabel('IT Priority', { exact: true }).selectOption('HIGH');
    await expect(page.getByRole('status')).toHaveText('IT Priority updated.');

    // AC-15: a Public Comment.
    const commentText = 'We are replacing the duplex roller this afternoon.';
    await page.getByLabel('Add a public comment').fill(commentText);
    await page.getByRole('button', { name: 'Post comment' }).click();
    await expect(page.locator('.tt-comment-public', { hasText: commentText })).toBeVisible();

    // AC-16: an Internal Note, on its own tab and visibly marked as internal.
    const noteText = 'Spare roller taken from the IT store, shelf B2.';
    await page.getByRole('tab', { name: 'Internal Notes' }).click();
    await page.getByLabel('Add an internal note').fill(noteText);
    await page.getByRole('button', { name: 'Post note' }).click();
    const note = page.locator('.tt-note-internal', { hasText: noteText });
    await expect(note).toBeVisible();
    await expect(note.getByText('Internal — not visible to Requester')).toBeVisible();

    // AC-13: the owner moves the Ticket through the permitted workflow.
    const steps: [string, string][] = [
      ['IN_PROGRESS', 'in-progress'],
      ['WAITING_FOR_REQUESTER', 'waiting'],
      ['IN_PROGRESS', 'in-progress'],
      ['RESOLVED', 'resolved'],
      ['CLOSED', 'closed'],
    ];
    for (const [status, badge] of steps) {
      await page.getByLabel('Change status').selectOption(status);
      await page.getByRole('button', { name: 'Update status' }).click();
      await expect(page.locator(`.tt-badge-status-${badge}`)).toBeVisible();
    }

    // BR-18: Reopen asks for confirmation first.
    await page.getByLabel('Change status').selectOption('REOPENED');
    await page.getByRole('button', { name: 'Update status' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Confirm' }).click();
    await expect(page.locator('.tt-badge-status-reopened')).toBeVisible();

    // The end state, read back from the API through the same session.
    const detail = await (await page.request.get(`/api/staff/tickets/${ticketId}`)).json();
    expect(detail).toMatchObject({ currentStatus: 'REOPENED', itPriority: 'HIGH', owner: { name: E2E_STAFF_NAME } });
    const comments = await (await page.request.get(`/api/tickets/${ticketId}/comments`)).json();
    const notes = await (await page.request.get(`/api/tickets/${ticketId}/notes`)).json();
    expect(comments.map((entry: { body: string }) => entry.body)).toEqual([commentText]);
    expect(notes.map((entry: { body: string }) => entry.body)).toEqual([noteText]);
  });
});
