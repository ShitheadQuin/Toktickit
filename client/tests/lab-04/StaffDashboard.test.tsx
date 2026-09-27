import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, within, cleanup } from '@testing-library/react';
import { Routes, Route } from 'react-router-dom';
import { Dashboard } from '../../src/pages/Dashboard';
import { renderWithAuth, withAuthMe } from '../support/auth-mock';
import type { AuthUser } from '../../src/context/AuthContext';

// UI-02 (AC-21, AC-22): the Staff dashboard for IT Staff and Administrators - cards, By Status and
// By IT Priority links, My Open Actions, Recent Tickets, User Accounts for Administrators only,
// loading and safe failure (docs/lab-04/ui-spec.md 3 and 5).
const STAFF: AuthUser = { id: 12, name: 'Pimchanok Rattana', email: 'pimchanok.rattana@toktickit.dev', role: 'IT_STAFF', mustChangePassword: false };
const ADMIN: AuthUser = { id: 1, name: 'Duangjai Meesuk', email: 'duangjai.meesuk@toktickit.dev', role: 'ADMINISTRATOR', mustChangePassword: false };
const STATUSES = ['NEW', 'OPEN', 'IN_PROGRESS', 'WAITING_FOR_REQUESTER', 'RESOLVED', 'CLOSED', 'REOPENED', 'CANCELLED'];

const ok = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body }) as Response;

const dashboard = (over: Record<string, unknown> = {}) => ({
  generatedAt: '2026-10-16T07:00:00.000Z',
  metrics: [
    { key: 'unassigned', label: 'Unassigned', count: 2, link: '/staff/queue?owner=unassigned&statusGroup=active' },
    { key: 'myTickets', label: 'My Tickets', count: 4, link: '/staff/queue?owner=12&statusGroup=active' },
    { key: 'highPriority', label: 'High IT Priority', count: 1, link: '/staff/queue?itPriority=HIGH&statusGroup=active' },
    { key: 'myOpenActions', label: 'My Open Actions', count: 3, link: null },
  ],
  byStatus: STATUSES.map((status, i) => ({ status, count: i, link: `/staff/queue?status=${status}` })),
  byItPriority: ['HIGH', 'MEDIUM', 'LOW'].map((itPriority, i) => ({ itPriority, count: i + 1, link: `/staff/queue?itPriority=${itPriority}&statusGroup=active` })),
  myOpenActions: [
    { id: 31, ticketId: 42, ticketNumber: 'TKT-2026-800004', description: 'Ask the LMS team to raise the upload limit', status: 'IN_PROGRESS', actionAt: '2026-10-15T02:00:00.000Z' },
  ],
  recentTickets: [
    { id: 42, ticketNumber: 'TKT-2026-800004', summary: 'Assignment upload fails with a timeout', currentStatus: 'IN_PROGRESS', updatedAt: '2026-10-15T09:14:00.000Z' },
  ],
  ...over,
});

function mockDashboard(user: AuthUser, handler: () => Response | Promise<Response>) {
  return vi.spyOn(global, 'fetch').mockImplementation(
    withAuthMe(user, async (input) => {
      const path = new URL(String(input), 'http://localhost').pathname;
      if (path === '/api/dashboard/staff') return handler();
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

describe('Staff dashboard (UI-02)', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('shows the cards as links, with My Open Actions as a figure without a link', async () => {
    mockDashboard(STAFF, () => ok(dashboard()));
    renderDashboard();

    expect(await screen.findByRole('heading', { name: /welcome, pimchanok/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Unassigned: 2, view list' })).toHaveAttribute('href', '/staff/queue?owner=unassigned&statusGroup=active');
    expect(screen.getByRole('link', { name: 'My Tickets: 4, view list' })).toHaveAttribute('href', '/staff/queue?owner=12&statusGroup=active');
    expect(screen.getByRole('link', { name: 'High IT Priority: 1, view list' })).toHaveAttribute('href', '/staff/queue?itPriority=HIGH&statusGroup=active');
    expect(screen.queryByRole('link', { name: /my open actions/i })).toBeNull();
    expect(screen.getByText('My Open Actions')).toBeInTheDocument();
  });

  it('links every status and IT Priority row to the filtered queue, zeros included', async () => {
    mockDashboard(STAFF, () => ok(dashboard()));
    renderDashboard();

    const byStatus = await screen.findByRole('region', { name: /by status/i });
    expect(within(byStatus).getAllByRole('link')).toHaveLength(8);
    expect(within(byStatus).getByRole('link', { name: /waiting for requester: 3/i })).toHaveAttribute('href', '/staff/queue?status=WAITING_FOR_REQUESTER');
    expect(within(byStatus).getByRole('link', { name: /new: 0/i })).toBeInTheDocument();
    const byPriority = screen.getByRole('region', { name: /by it priority/i });
    expect(within(byPriority).getByRole('link', { name: /high: 1/i })).toHaveAttribute('href', '/staff/queue?itPriority=HIGH&statusGroup=active');
  });

  it('lists my open Actions and recent Tickets, each opening the Staff Ticket Detail', async () => {
    mockDashboard(STAFF, () => ok(dashboard()));
    renderDashboard();

    const actions = await screen.findByRole('region', { name: /my open actions/i });
    expect(within(actions).getByText('Ask the LMS team to raise the upload limit')).toBeInTheDocument();
    expect(within(actions).getByRole('link', { name: 'TKT-2026-800004' })).toHaveAttribute('href', '/staff/tickets/42');
    const recent = screen.getByRole('region', { name: /recent tickets/i });
    expect(within(recent).getByRole('link', { name: 'TKT-2026-800004' })).toHaveAttribute('href', '/staff/tickets/42');
    expect(screen.getByRole('link', { name: /open ticket queue/i })).toHaveAttribute('href', '/staff/queue');
  });

  it('shows User Accounts only when the server sends them (Administrator)', async () => {
    mockDashboard(STAFF, () => ok(dashboard()));
    const first = renderDashboard();
    await screen.findByRole('region', { name: /by status/i });
    expect(screen.queryByRole('region', { name: /user accounts/i })).toBeNull();
    first.unmount();
    vi.restoreAllMocks();

    mockDashboard(ADMIN, () => ok(dashboard({ userCounts: { requester: 4, itStaff: 3, administrator: 1, inactive: 2, link: '/users' } })));
    renderDashboard();
    const accounts = await screen.findByRole('region', { name: /user accounts/i });
    expect(accounts).toHaveTextContent(/requesters\s*4/i);
    expect(accounts).toHaveTextContent(/inactive\s*2/i);
    expect(within(accounts).getByRole('link', { name: /manage users/i })).toHaveAttribute('href', '/users');
  });

  it('explains empty lists, and shows a safe failure with Retry', async () => {
    mockDashboard(STAFF, () => ok(dashboard({ myOpenActions: [], recentTickets: [] })));
    const first = renderDashboard();
    expect(await screen.findByText(/no open actions are assigned to you/i)).toBeInTheDocument();
    expect(screen.getByText(/there are no tickets yet/i)).toBeInTheDocument();
    first.unmount();
    vi.restoreAllMocks();

    mockDashboard(STAFF, () => ok({ error: { code: 'INTERNAL_ERROR' } }, 500));
    renderDashboard();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/the dashboard could not be loaded/i);
    expect(within(alert).getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });
});
