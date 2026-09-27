import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, within, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { Routes, Route } from 'react-router-dom';
import { Dashboard } from '../../src/pages/Dashboard';
import { MOCK_REQUESTER, renderWithAuth, withAuthMe } from '../support/auth-mock';

// UI-01 (AC-02, AC-23): the Requester dashboard - cards with drill-down links, recent lists, empty
// text, loading, safe failure and forbidden (docs/lab-04/ui-spec.md 3 and 4).
const ok = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body }) as Response;

const dashboard = (over: Record<string, unknown> = {}) => ({
  generatedAt: '2026-10-16T07:00:00.000Z',
  metrics: [
    { key: 'myOpen', label: 'My Open Tickets', count: 3, link: '/my-tickets?statusGroup=active' },
    { key: 'waitingForMe', label: 'Waiting for Me', count: 1, link: '/my-tickets?currentStatus=WAITING_FOR_REQUESTER' },
    { key: 'resolved', label: 'Resolved', count: 2, link: '/my-tickets?currentStatus=RESOLVED' },
    { key: 'closed', label: 'Closed', count: 5, link: '/my-tickets?currentStatus=CLOSED' },
  ],
  recentTickets: [
    { id: 42, ticketNumber: 'TKT-2026-800004', summary: 'Assignment upload fails with a timeout', currentStatus: 'IN_PROGRESS', updatedAt: '2026-10-15T09:14:00.000Z' },
  ],
  recentlyResolved: [
    { id: 47, ticketNumber: 'TKT-2026-800007', summary: 'Calendar invitations arrive without the meeting link', currentStatus: 'RESOLVED', updatedAt: '2026-10-14T03:00:00.000Z' },
  ],
  ...over,
});

function mockDashboard(handler: () => Response | Promise<Response>) {
  return vi.spyOn(global, 'fetch').mockImplementation(
    withAuthMe(MOCK_REQUESTER, async (input) => {
      const path = new URL(String(input), 'http://localhost').pathname;
      if (path === '/api/dashboard/requester') return handler();
      throw new Error(`Unexpected fetch: ${path}`);
    }),
  );
}

function renderDashboard() {
  return renderWithAuth(
    <Routes>
      <Route path="/dashboard" element={<Dashboard />} />
    </Routes>,
    ['/dashboard'],
  );
}

describe('Requester dashboard (UI-01)', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('greets the Requester and shows each card as a labelled link to its filtered list', async () => {
    mockDashboard(() => ok(dashboard()));
    renderDashboard();

    expect(await screen.findByRole('heading', { name: /welcome, anong/i })).toBeInTheDocument();
    const cards = [
      ['My Open Tickets: 3, view list', '/my-tickets?statusGroup=active'],
      ['Waiting for Me: 1, view list', '/my-tickets?currentStatus=WAITING_FOR_REQUESTER'],
      ['Resolved: 2, view list', '/my-tickets?currentStatus=RESOLVED'],
      ['Closed: 5, view list', '/my-tickets?currentStatus=CLOSED'],
    ];
    for (const [name, href] of cards) {
      expect(screen.getByRole('link', { name })).toHaveAttribute('href', href);
    }
    // Attention is never colour alone.
    expect(screen.getByText(/needs your reply/i)).toBeInTheDocument();
  });

  it('lists recent and recently resolved Tickets, each linking to its detail, plus the quick actions', async () => {
    mockDashboard(() => ok(dashboard()));
    renderDashboard();

    const recent = await screen.findByRole('region', { name: /my recent tickets/i });
    expect(within(recent).getByRole('link', { name: 'TKT-2026-800004' })).toHaveAttribute('href', '/tickets/42');
    const resolved = screen.getByRole('region', { name: /recently resolved/i });
    expect(within(resolved).getByRole('link', { name: 'TKT-2026-800007' })).toHaveAttribute('href', '/tickets/47');
    expect(screen.getByRole('link', { name: /create ticket/i })).toHaveAttribute('href', '/create-ticket');
    expect(screen.getByRole('link', { name: /view my tickets/i })).toHaveAttribute('href', '/my-tickets');
  });

  it('shows zeros and explanatory text when there is nothing yet (AC-23)', async () => {
    mockDashboard(() =>
      ok(dashboard({ metrics: dashboard().metrics.map((m) => ({ ...m, count: 0 })), recentTickets: [], recentlyResolved: [] })),
    );
    renderDashboard();

    expect(await screen.findByRole('link', { name: 'My Open Tickets: 0, view list' })).toBeInTheDocument();
    expect(screen.getByText(/you have no tickets yet/i)).toBeInTheDocument();
    expect(screen.getByText(/nothing resolved in the last 7 days/i)).toBeInTheDocument();
    expect(screen.queryByText(/needs your reply/i)).toBeNull();
  });

  it('shows a loading state, then a safe failure with Retry that loads again', async () => {
    let calls = 0;
    mockDashboard(() => {
      calls++;
      return calls === 1 ? Promise.reject(new TypeError('Failed to fetch')) : ok(dashboard());
    });
    renderDashboard();

    expect(screen.getByText(/loading the dashboard/i)).toBeInTheDocument();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/the dashboard could not be loaded/i);
    fireEvent.click(within(alert).getByRole('button', { name: /retry/i }));
    expect(await screen.findByRole('link', { name: 'My Open Tickets: 3, view list' })).toBeInTheDocument();
  });

  it('shows a forbidden message when the server refuses', async () => {
    mockDashboard(() => ok({ error: { code: 'FORBIDDEN', message: 'Not permitted for this role' } }, 403));
    renderDashboard();
    expect(await screen.findByText(/you do not have access to this page/i)).toBeInTheDocument();
  });

  it('reloads the figures with Refresh', async () => {
    const spy = mockDashboard(() => ok(dashboard()));
    renderDashboard();
    await screen.findByRole('link', { name: 'My Open Tickets: 3, view list' });
    fireEvent.click(screen.getByRole('button', { name: /refresh/i }));
    await waitFor(() => expect(spy.mock.calls.filter(([i]) => String(i).includes('/api/dashboard/requester'))).toHaveLength(2));
  });
});
