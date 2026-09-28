import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { Routes, Route, useLocation } from 'react-router-dom';
import { MyTickets } from '../../src/pages/MyTickets';
import { StaffTicketQueue } from '../../src/pages/StaffTicketQueue';
import { MOCK_REQUESTER, renderWithAuth, withAuthMe } from '../support/auth-mock';
import type { AuthUser } from '../../src/context/AuthContext';

// UI-09 (AC-24): My Tickets and the Ticket Queue take their filters from the page address, so a
// dashboard card's link opens the list it counted, and write changes back (ui-spec.md 6).
const STAFF: AuthUser = { id: 12, name: 'Pimchanok Rattana', email: 'pimchanok.rattana@toktickit.dev', role: 'IT_STAFF', mustChangePassword: false };
const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as Response;

function Location() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname + location.search}</output>;
}

function mockLists(user: AuthUser) {
  return vi.spyOn(global, 'fetch').mockImplementation(
    withAuthMe(user, async (input) => {
      const url = new URL(String(input), 'http://localhost');
      if (url.pathname === '/api/tickets') return ok({ data: [], page: 1, pageSize: 10, totalItems: 0, totalPages: 0 });
      if (url.pathname === '/api/staff/tickets') return ok({ data: [], page: 1, pageSize: 20, totalCount: 0, totalPages: 0 });
      if (url.pathname === '/api/categories' || url.pathname === '/api/related-systems') return ok([]);
      throw new Error(`Unexpected fetch: ${url.pathname}`);
    }),
  );
}

const listCalls = (spy: ReturnType<typeof mockLists>, path: string) =>
  spy.mock.calls.map(([input]) => new URL(String(input), 'http://localhost')).filter((url) => url.pathname === path);

describe('Filters in the page address (UI-09)', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('opens My Tickets with the filters from the link, shows the Active statuses chip, and removes it', async () => {
    const spy = mockLists(MOCK_REQUESTER);
    renderWithAuth(
      <Routes>
        <Route path="/my-tickets" element={<><MyTickets /><Location /></>} />
      </Routes>,
      ['/my-tickets?statusGroup=active'],
    );

    await waitFor(() => expect(listCalls(spy, '/api/tickets').at(-1)?.searchParams.get('statusGroup')).toBe('active'));
    const remove = screen.getByRole('button', { name: /remove filter: active statuses/i });
    expect(screen.getByText('Active statuses')).toBeInTheDocument();

    fireEvent.click(remove);
    await waitFor(() => expect(listCalls(spy, '/api/tickets').at(-1)?.searchParams.get('statusGroup')).toBeNull());
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/my-tickets$/);
  });

  it('applies a status from the link and keeps the address in step with a changed filter', async () => {
    const spy = mockLists(MOCK_REQUESTER);
    renderWithAuth(
      <Routes>
        <Route path="/my-tickets" element={<><MyTickets /><Location /></>} />
      </Routes>,
      ['/my-tickets?currentStatus=RESOLVED'],
    );

    await waitFor(() => expect(listCalls(spy, '/api/tickets').at(-1)?.searchParams.get('currentStatus')).toBe('RESOLVED'));
    expect(screen.getByLabelText(/current status/i)).toHaveValue('RESOLVED');
  });

  it('opens the Ticket Queue with owner and statusGroup from the link, showing "Me" for the viewer\'s own id', async () => {
    const spy = mockLists(STAFF);
    renderWithAuth(
      <Routes>
        <Route path="/staff/queue" element={<><StaffTicketQueue /><Location /></>} />
      </Routes>,
      ['/staff/queue?owner=12&statusGroup=active'],
    );

    await waitFor(() => {
      const last = listCalls(spy, '/api/staff/tickets').at(-1);
      expect(last?.searchParams.get('owner')).toBe('12');
      expect(last?.searchParams.get('statusGroup')).toBe('active');
    });
    expect(screen.getByLabelText(/assigned/i)).toHaveValue('me');
    expect(screen.getByText('Active statuses')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/^status$/i), { target: { value: 'IN_PROGRESS' } });
    await waitFor(() => expect(screen.getByTestId('location').textContent).toContain('status=IN_PROGRESS'));
    expect(screen.getByTestId('location').textContent).toContain('owner=12');
  });
});
