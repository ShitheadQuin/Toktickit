import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, waitFor, within, cleanup, fireEvent, render } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { StaffTicketDetail } from '../../src/pages/StaffTicketDetail';
import { StatusHistory } from '../../src/components/StatusHistory';
import { AppShell } from '../../src/components/AppShell';
import { renderWithAuth, withAuthMe } from '../support/auth-mock';
import { AuthProvider, type AuthUser } from '../../src/context/AuthContext';
import type { ReactNode } from 'react';

// UI-07 (AC-20) and UI-08 (AC-13, AC-14): the status control with the resolution gate, the
// stale-update and gate refusals, and the Status History list (docs/lab-04/ui-spec.md 8, 9).
const ME: AuthUser = { id: 12, name: 'Pimchanok Rattana', email: 'pimchanok.rattana@toktickit.dev', role: 'IT_STAFF', mustChangePassword: false };

const ticket = (over: Record<string, unknown> = {}) => ({
  id: 42,
  ticketNumber: 'TKT-2026-000042',
  ticketDate: '2026-10-01T03:15:00.000Z',
  createdAt: '2026-10-01T03:15:00.000Z',
  updatedAt: '2026-10-02T08:00:00.000Z',
  version: 3,
  summary: 'Projector shows no signal',
  description: 'No signal from the lectern PC.',
  requestedPriority: 'HIGH',
  itPriority: 'HIGH',
  currentStatus: 'IN_PROGRESS',
  requesterConfirmedAt: null,
  requester: { id: 3, name: 'Kritsada Boonmee', email: 'kritsada.boonmee@toktickit.dev' },
  owner: { id: 12, name: 'Pimchanok Rattana' },
  category: { id: 1, name: 'Hardware' },
  relatedSystem: { id: 2, name: 'Campus Wi-Fi' },
  attachments: [],
  gate: { completed: 1, open: 0, met: true },
  ...over,
});

const historyRow = (id: number, fromStatus: string, toStatus: string) => ({
  id,
  fromStatus,
  toStatus,
  changedAt: '2026-10-02T03:02:00.000Z',
  changedBy: { id: 12, name: 'Pimchanok Rattana' },
});

const ok = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body }) as Response;
type Handler = (body: Record<string, unknown> | undefined) => Response | Promise<Response>;

function mockApi(routes: Record<string, Handler>, user: AuthUser = ME) {
  return vi.spyOn(global, 'fetch').mockImplementation(
    withAuthMe(user, async (input, init) => {
      const url = new URL(String(input), 'http://localhost');
      const method = (init?.method ?? 'GET').toUpperCase();
      const handler = routes[`${method} ${url.pathname}`];
      if (!handler) throw new Error(`Unexpected fetch: ${method} ${url.pathname}`);
      return handler(init?.body ? JSON.parse(String(init.body)) : undefined);
    }),
  );
}

function baseRoutes(detail: ReturnType<typeof ticket>, extra: Record<string, Handler> = {}): Record<string, Handler> {
  return {
    'GET /api/staff/tickets/42': () => ok(detail),
    'GET /api/staff/assignable-users': () => ok([{ id: 12, name: 'Pimchanok Rattana', role: 'IT_STAFF' }]),
    'GET /api/tickets/42/comments': () => ok([]),
    'GET /api/tickets/42/notes': () => ok([]),
    'GET /api/tickets/42/actions': () => ok([]),
    'GET /api/tickets/42/history': () => ok([historyRow(1, 'NEW', 'OPEN'), historyRow(2, 'OPEN', 'IN_PROGRESS')]),
    ...extra,
  };
}

const callsTo = (spy: ReturnType<typeof mockApi>, method: string, path: string) =>
  spy.mock.calls.filter(([input, init]) => new URL(String(input), 'http://localhost').pathname === path && (init?.method ?? 'GET').toUpperCase() === method);

function renderDetail() {
  return renderWithAuth(
    <Routes>
      <Route path="/staff/tickets/:id" element={<StaffTicketDetail />} />
    </Routes>,
    ['/staff/tickets/42'],
  );
}

const resolvedOption = () => within(screen.getByLabelText(/change status/i)).getByRole('option', { name: 'Resolved' });

describe('Ticket workflow on Staff Ticket Detail', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  describe('status control and the resolution gate (UI-07, AC-20)', () => {
    it('disables Resolved with "add and complete an Action" when no Action is Completed', async () => {
      mockApi(baseRoutes(ticket({ gate: { completed: 0, open: 0, met: false } })));
      renderDetail();
      await screen.findByDisplayValue('TKT-2026-000042');

      expect(resolvedOption()).toBeDisabled();
      expect(screen.getByText(/add and complete at least one action first/i)).toBeInTheDocument();
      expect(within(screen.getByLabelText(/change status/i)).getByRole('option', { name: 'Waiting for Requester' })).not.toBeDisabled();
    });

    it('disables Resolved with the number of open Actions when some are still open', async () => {
      mockApi(baseRoutes(ticket({ gate: { completed: 1, open: 2, met: false } })));
      renderDetail();
      await screen.findByDisplayValue('TKT-2026-000042');

      expect(resolvedOption()).toBeDisabled();
      expect(screen.getByText(/complete or cancel the open actions first \(2 open\)/i)).toBeInTheDocument();
    });

    it('offers Resolved once the gate is met', async () => {
      mockApi(baseRoutes(ticket()));
      renderDetail();
      await screen.findByDisplayValue('TKT-2026-000042');
      expect(resolvedOption()).not.toBeDisabled();
      expect(screen.queryByText(/before resolving|first \(/i)).toBeNull();
    });

    it('sends the version it was based on, then refreshes the status and the history', async () => {
      const spy = mockApi(baseRoutes(ticket(), {
        'PATCH /api/staff/tickets/42/status': () => ok(ticket({ currentStatus: 'RESOLVED', version: 4 })),
      }));
      const { container } = renderDetail();
      await screen.findByDisplayValue('TKT-2026-000042');
      const historyCallsBefore = callsTo(spy, 'GET', '/api/tickets/42/history').length;

      fireEvent.change(screen.getByLabelText(/change status/i), { target: { value: 'RESOLVED' } });
      fireEvent.click(screen.getByRole('button', { name: /update status/i }));

      await waitFor(() => expect(container.querySelector('.tt-badge-status-resolved')).not.toBeNull());
      expect(JSON.parse(String(callsTo(spy, 'PATCH', '/api/staff/tickets/42/status')[0][1]!.body))).toEqual({ status: 'RESOLVED', expectedVersion: 3 });
      await waitFor(() => expect(callsTo(spy, 'GET', '/api/tickets/42/history').length).toBeGreaterThan(historyCallsBefore));
    });
  });

  describe('refusals from the server (UI-08, AC-13, AC-14)', () => {
    it('shows a gate refusal as a warning with Reload and keeps the displayed status', async () => {
      mockApi(baseRoutes(ticket(), {
        'PATCH /api/staff/tickets/42/status': () =>
          ok({ error: { code: 'RESOLUTION_GATE_NOT_MET', message: 'Complete or cancel the remaining Actions Taken before resolving.', details: { completed: 1, open: 1 } } }, 409),
      }));
      const { container } = renderDetail();
      await screen.findByDisplayValue('TKT-2026-000042');

      fireEvent.change(screen.getByLabelText(/change status/i), { target: { value: 'RESOLVED' } });
      fireEvent.click(screen.getByRole('button', { name: /update status/i }));

      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent(/complete or cancel the remaining actions/i);
      expect(within(alert).getByRole('button', { name: /reload/i })).toBeInTheDocument();
      expect(container.querySelector('.tt-badge-status-in-progress')).not.toBeNull();
    });

    it('shows a stale update as a warning, and Reload fetches the latest Ticket', async () => {
      let detailCalls = 0;
      const spy = mockApi(baseRoutes(ticket(), {
        'GET /api/staff/tickets/42': () => {
          detailCalls++;
          return ok(detailCalls === 1 ? ticket() : ticket({ itPriority: 'LOW', version: 4 }));
        },
        'PATCH /api/staff/tickets/42/priority': () =>
          ok({ error: { code: 'STALE_UPDATE', message: 'This Ticket changed while you were working on it. Reload to see the latest version.' } }, 409),
      }));
      renderDetail();
      await screen.findByDisplayValue('TKT-2026-000042');

      fireEvent.change(screen.getByLabelText('IT Priority'), { target: { value: 'MEDIUM' } });
      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent(/changed while you were working on it/i);

      fireEvent.click(within(alert).getByRole('button', { name: /reload/i }));
      await waitFor(() => expect(screen.getByLabelText('IT Priority')).toHaveValue('LOW'));
      expect(callsTo(spy, 'GET', '/api/staff/tickets/42').length).toBe(2);
    });
  });

  describe('Status History (ui-spec.md 9, AC-18)', () => {
    it('lists changes oldest first with who made them', async () => {
      mockApi(baseRoutes(ticket()));
      renderDetail();
      const history = await screen.findByRole('region', { name: /status history/i });
      const rows = await within(history).findAllByRole('listitem');
      expect(rows.map((r) => r.textContent)).toEqual([
        expect.stringMatching(/New → Open.*Pimchanok Rattana/),
        expect.stringMatching(/Open → In Progress.*Pimchanok Rattana/),
      ]);
    });

    it('explains an empty history', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValue(ok([]));
      render(<StatusHistory ticketId={42} refreshToken={0} />);
      expect(await screen.findByText(/no status changes recorded since lab 4/i)).toBeInTheDocument();
    });
  });

  describe('Administrator access (AC-16)', () => {
    it('gives an Administrator the Ticket Queue as well as Users', async () => {
      const admin: AuthUser = { id: 1, name: 'Duangjai Meesuk', email: 'duangjai.meesuk@toktickit.dev', role: 'ADMINISTRATOR', mustChangePassword: false };
      vi.spyOn(global, 'fetch').mockImplementation(withAuthMe(admin, async () => ok({})));
      render(
        <MemoryRouter>
          <AppShellWithAuth>
            <p>content</p>
          </AppShellWithAuth>
        </MemoryRouter>,
      );
      const nav = await screen.findByRole('navigation', { name: 'Main' });
      expect(within(nav).getByRole('link', { name: 'Ticket Queue' })).toHaveAttribute('href', '/staff/queue');
      expect(within(nav).getByRole('link', { name: 'Users' })).toHaveAttribute('href', '/users');
    });
  });
});

// AppShell reads the signed-in user from AuthProvider, which renderWithAuth normally supplies.
function AppShellWithAuth({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <AppShell>{children}</AppShell>
    </AuthProvider>
  );
}
