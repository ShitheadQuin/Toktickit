import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, waitFor, within, cleanup, fireEvent } from '@testing-library/react';
import { StaffTicketQueue } from '../../src/pages/StaffTicketQueue';
import { renderWithAuth, withAuthMe } from '../support/auth-mock';
import type { AuthUser } from '../../src/context/AuthContext';

// UI-03 - AC-10, ui-spec.md 6/10: the IT Staff Ticket Queue's controls, and its loading, empty,
// no-results and failure states. Layout at each breakpoint (table vs. stacked card) is RESP-01's job
// in #40 - jsdom has no layout to measure.
const MOCK_IT_STAFF: AuthUser = {
  id: 12,
  name: 'Jane Lee',
  email: 'jane.lee@toktickit.dev',
  role: 'IT_STAFF',
  mustChangePassword: false,
};

const row = (id: number, over: Record<string, unknown> = {}) => ({
  id,
  ticketNumber: `TKT-2026-0000${id}`,
  summary: `Queue ticket ${id} summary`,
  requester: { id: 3, name: 'Somchai Dee' },
  currentStatus: 'OPEN',
  itPriority: 'HIGH',
  owner: { id: 12, name: 'Jane Lee' },
  createdAt: '2026-09-10T03:15:00.000Z',
  ...over,
});

const pageOf = (data: unknown[], over: Record<string, unknown> = {}) => ({
  data,
  page: 1,
  pageSize: 20,
  totalCount: data.length,
  totalPages: data.length === 0 ? 0 : 1,
  ...over,
});

/** Answers /auth/me and the queue endpoint in order (the last response repeats); returns the spy. */
function mockQueue(responses: unknown[]) {
  const pending = [...responses];
  return vi.spyOn(global, 'fetch').mockImplementation(
    withAuthMe(MOCK_IT_STAFF, async (input) => {
      const url = String(input);
      if (url.includes('/api/staff/tickets')) {
        const body = pending.length > 1 ? pending.shift() : pending[0];
        return { ok: true, json: async () => body } as Response;
      }
      throw new Error(`Unexpected fetch: ${url}`);
    }),
  );
}

const queueUrls = (spy: ReturnType<typeof mockQueue>) =>
  spy.mock.calls.map(([input]) => String(input)).filter((url) => url.includes('/api/staff/tickets'));

const lastQueueUrl = (spy: ReturnType<typeof mockQueue>) => new URL(queueUrls(spy).at(-1)!, 'http://localhost');

function renderQueue() {
  return renderWithAuth(<StaffTicketQueue />);
}

describe('StaffTicketQueue (UI-03)', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('shows a loading state while the first request is in flight', async () => {
    vi.spyOn(global, 'fetch').mockImplementation(withAuthMe(MOCK_IT_STAFF, () => new Promise(() => {})));

    renderQueue();

    expect(await screen.findByText(/loading/i)).toBeInTheDocument();
  });

  it('requests the documented defaults on first load, with the session cookie', async () => {
    const spy = mockQueue([pageOf([row(1)])]);

    renderQueue();
    await screen.findByRole('table');

    const url = lastQueueUrl(spy);
    expect(url.searchParams.get('sort')).toBe('createdAt');
    expect(url.searchParams.get('order')).toBe('asc');
    expect(url.searchParams.get('page')).toBe('1');
    expect(url.searchParams.has('owner')).toBe(false);

    const call = spy.mock.calls.find(([input]) => String(input).includes('/api/staff/tickets'));
    expect((call?.[1] as RequestInit | undefined)?.credentials).toBe('include');
  });

  it('shows exactly the 7 Queue columns, with badges and a link to Ticket Detail', async () => {
    mockQueue([pageOf([row(42)])]);

    const { container } = renderQueue();
    const table = await screen.findByRole('table');

    const headers = within(table).getAllByRole('columnheader').map((header) => header.textContent?.trim());
    expect(headers).toEqual(['Ticket #', 'Summary', 'Requester', 'Status', 'IT Priority', 'Assigned To', 'Created']);

    const tableRow = within(table).getByText('TKT-2026-000042').closest('tr')!;
    expect(within(tableRow).getByText('Somchai Dee')).toBeInTheDocument();
    expect(within(tableRow).getByText('Jane Lee')).toBeInTheDocument();
    // Badges always show their word (ui-spec.md 9), with the class from badge-classes.ts.
    expect(within(tableRow).getByText('Open')).toHaveClass('tt-badge-status-open');
    expect(within(tableRow).getByText('High')).toHaveClass('tt-badge-priority-high');
    expect(within(tableRow).getByRole('link', { name: 'TKT-2026-000042' })).toHaveAttribute('href', '/staff/tickets/42');
    expect(container.querySelector('.tt-badge-status-open')).not.toBeNull();
  });

  it('shows "Unassigned" for a Ticket with no owner', async () => {
    mockQueue([pageOf([row(1, { owner: null })])]);

    renderQueue();
    const table = await screen.findByRole('table');

    expect(within(table).getByText('Unassigned')).toBeInTheDocument();
  });

  it('sends the search term on submit and returns to page 1', async () => {
    const spy = mockQueue([pageOf([row(1)], { totalCount: 45, totalPages: 3 })]);

    renderQueue();
    await screen.findByRole('table');
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    await waitFor(() => expect(lastQueueUrl(spy).searchParams.get('page')).toBe('2'));

    fireEvent.change(screen.getByLabelText(/^search$/i), { target: { value: 'printer' } });
    fireEvent.click(screen.getByRole('button', { name: /^search$/i }));

    await waitFor(() => {
      const url = lastQueueUrl(spy);
      expect(url.searchParams.get('search')).toBe('printer');
      expect(url.searchParams.get('page')).toBe('1');
    });
  });

  it('sends the Status and IT Priority filters', async () => {
    const spy = mockQueue([pageOf([row(1)])]);

    renderQueue();
    await screen.findByRole('table');

    fireEvent.change(screen.getByLabelText(/^status$/i), { target: { value: 'IN_PROGRESS' } });
    await waitFor(() => expect(lastQueueUrl(spy).searchParams.get('status')).toBe('IN_PROGRESS'));

    fireEvent.change(screen.getByLabelText(/^it priority$/i), { target: { value: 'LOW' } });
    await waitFor(() => expect(lastQueueUrl(spy).searchParams.get('itPriority')).toBe('LOW'));
  });

  it('sends Assigned as the signed-in user id for Me, "unassigned" for Unassigned, and nothing for Anyone', async () => {
    const spy = mockQueue([pageOf([row(1)])]);

    renderQueue();
    await screen.findByRole('table');
    const assigned = screen.getByLabelText(/^assigned$/i);

    fireEvent.change(assigned, { target: { value: 'me' } });
    await waitFor(() => expect(lastQueueUrl(spy).searchParams.get('owner')).toBe('12'));

    fireEvent.change(assigned, { target: { value: 'unassigned' } });
    await waitFor(() => expect(lastQueueUrl(spy).searchParams.get('owner')).toBe('unassigned'));

    fireEvent.change(assigned, { target: { value: '' } });
    await waitFor(() => expect(lastQueueUrl(spy).searchParams.has('owner')).toBe(false));
  });

  it('sends the chosen sort field and order', async () => {
    const spy = mockQueue([pageOf([row(1)])]);

    renderQueue();
    await screen.findByRole('table');

    fireEvent.change(screen.getByLabelText(/sort by/i), { target: { value: 'itPriority' } });
    await waitFor(() => expect(lastQueueUrl(spy).searchParams.get('sort')).toBe('itPriority'));

    fireEvent.change(screen.getByLabelText(/^order$/i), { target: { value: 'desc' } });
    await waitFor(() => expect(lastQueueUrl(spy).searchParams.get('order')).toBe('desc'));
  });

  it('requests the next page, and returns to page 1 when a filter changes', async () => {
    const spy = mockQueue([pageOf([row(1)], { totalCount: 45, totalPages: 3 })]);

    renderQueue();
    await screen.findByRole('table');

    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    await waitFor(() => expect(lastQueueUrl(spy).searchParams.get('page')).toBe('2'));

    fireEvent.change(screen.getByLabelText(/^status$/i), { target: { value: 'OPEN' } });
    await waitFor(() => {
      const url = lastQueueUrl(spy);
      expect(url.searchParams.get('status')).toBe('OPEN');
      expect(url.searchParams.get('page')).toBe('1');
    });
  });

  it('shows Clear filters only once a filter is active, and clearing sends no filters', async () => {
    const spy = mockQueue([pageOf([row(1)])]);

    renderQueue();
    await screen.findByRole('table');
    expect(screen.queryByRole('button', { name: /clear filters/i })).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/^it priority$/i), { target: { value: 'HIGH' } });
    fireEvent.click(await screen.findByRole('button', { name: /clear filters/i }));

    await waitFor(() => {
      const url = lastQueueUrl(spy);
      expect(url.searchParams.has('itPriority')).toBe(false);
      expect(url.searchParams.has('status')).toBe(false);
      expect(url.searchParams.has('owner')).toBe(false);
      expect(url.searchParams.has('search')).toBe(false);
    });
  });

  it('shows the empty state, not no-results, when the queue has no Tickets at all', async () => {
    mockQueue([pageOf([])]);

    const { container } = renderQueue();

    expect(await screen.findByText(/no tickets in the queue/i)).toBeInTheDocument();
    expect(screen.queryByText(/no tickets match/i)).not.toBeInTheDocument();
    expect(container.querySelector('.tt-empty-state')).not.toBeNull();
  });

  it('shows a visually distinct no-results state with Clear filters once a search matches nothing', async () => {
    mockQueue([pageOf([row(1)]), pageOf([])]);

    const { container } = renderQueue();
    await screen.findByRole('table');

    fireEvent.change(screen.getByLabelText(/^search$/i), { target: { value: 'nothing matches this' } });
    fireEvent.click(screen.getByRole('button', { name: /^search$/i }));

    expect(await screen.findByText(/no tickets match/i)).toBeInTheDocument();
    expect(screen.queryByText(/no tickets in the queue/i)).not.toBeInTheDocument();
    expect(container.querySelector('.tt-no-results')).not.toBeNull();
    expect(container.querySelector('.tt-empty-state')).toBeNull();
    expect(screen.getByRole('button', { name: /clear filters/i })).toBeInTheDocument();
  });

  it('shows a safe error with a retry action when the queue request fails, not the empty state', async () => {
    vi.spyOn(global, 'fetch').mockImplementation(
      withAuthMe(MOCK_IT_STAFF, () => Promise.reject(new TypeError('Failed to fetch'))),
    );

    renderQueue();

    expect(await screen.findByRole('alert')).toHaveTextContent(/unable to load the queue/i);
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
    expect(screen.queryByText(/no tickets in the queue/i)).not.toBeInTheDocument();
  });
});
