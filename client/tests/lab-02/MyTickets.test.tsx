import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor, within, cleanup, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { RequesterProvider, useRequester } from '../../src/context/RequesterContext';
import { MyTickets } from '../../src/pages/MyTickets';

const STORAGE_KEY = 'toktickit.selectedRequester';

function selectStoredRequester(id = 1, name = 'Anong Srisai') {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ id, name }));
}

const ticket = (n: number, over: Record<string, unknown> = {}) => ({
  id: n,
  ticketNumber: `TKT-2026-00000${n}`,
  summary: `Ticket number ${n} summary`,
  ticketDate: '2026-08-30T03:15:00.000Z',
  updatedAt: '2026-08-31T09:45:00.000Z',
  requestedPriority: 'MEDIUM',
  currentStatus: 'NEW',
  category: { id: 1, name: 'Hardware' },
  ...over,
});

const page = (data: unknown[], over: Record<string, unknown> = {}) => ({
  data,
  page: 1,
  pageSize: 10,
  totalItems: data.length,
  totalPages: data.length === 0 ? 0 : 1,
  ...over,
});

/** Answers reference-data and ticket-list calls; returns the spy so URLs can be inspected. */
function mockApi(listResponses: unknown[]) {
  const queue = [...listResponses];
  return vi.spyOn(global, 'fetch').mockImplementation((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/api/categories')) {
      return Promise.resolve({ ok: true, json: async () => [{ id: 1, name: 'Hardware' }, { id: 2, name: 'Network' }] } as Response);
    }
    if (url.includes('/api/related-systems')) {
      return Promise.resolve({ ok: true, json: async () => [{ id: 1, name: 'Campus Wi-Fi' }] } as Response);
    }
    if (url.includes('/api/tickets')) {
      const body = queue.length > 1 ? queue.shift() : queue[0];
      return Promise.resolve({ ok: true, json: async () => body } as Response);
    }
    return Promise.reject(new Error(`Unexpected fetch: ${url}`));
  });
}

const ticketListUrls = (spy: ReturnType<typeof mockApi>) =>
  spy.mock.calls.map(([input]) => String(input)).filter((url) => url.includes('/api/tickets'));

function renderMyTickets() {
  return render(
    <MemoryRouter>
      <RequesterProvider>
        <MyTickets />
      </RequesterProvider>
    </MemoryRouter>,
  );
}

/** Renders My Tickets with a button that switches the current Requester, for AC-15. */
function SwitchHarness() {
  const { selectRequester } = useRequester();
  return (
    <>
      <button type="button" onClick={() => selectRequester({ id: 2, name: 'Kritsada Boonmee' })}>
        Switch to B
      </button>
      <MyTickets />
    </>
  );
}

describe('MyTickets', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    sessionStorage.clear();
  });

  it('shows a loading state while the first request is in flight', () => {
    selectStoredRequester();
    vi.spyOn(global, 'fetch').mockImplementation(() => new Promise(() => {}));

    renderMyTickets();

    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it('requests the caller’s own Tickets with the BR-10 defaults on first load', async () => {
    selectStoredRequester(3, 'Suphachai Wattana');
    const spy = mockApi([page([ticket(1)])]);

    renderMyTickets();
    await screen.findByRole('table');

    const [url] = ticketListUrls(spy);
    expect(url).toContain('sort=ticketDate');
    expect(url).toContain('order=desc');
    expect(url).toContain('page=1');

    const listCall = spy.mock.calls.find(([input]) => String(input).includes('/api/tickets'));
    const headers = (listCall?.[1] as RequestInit | undefined)?.headers as Record<string, string>;
    expect(headers['X-Requester-Id']).toBe('3');
  });

  it('renders each Ticket with its Last Updated value and its badges (ui-spec 11, 12)', async () => {
    selectStoredRequester();
    mockApi([page([ticket(1, { requestedPriority: 'HIGH' })])]);

    const { container } = renderMyTickets();
    const table = await screen.findByRole('table');
    const row = within(table).getByText('TKT-2026-000001').closest('tr')!;

    expect(within(table).getByRole('columnheader', { name: /last updated/i })).toBeInTheDocument();
    expect(within(row).getByText(/hardware/i)).toBeInTheDocument();
    // Badges pair color with the word itself, never color alone (ui-spec 9, 12).
    expect(within(row).getByText(/high/i)).toBeInTheDocument();
    expect(within(row).getByText(/new/i)).toBeInTheDocument();
    expect(container.querySelector('.tt-badge-priority-high')).not.toBeNull();
    expect(container.querySelector('.tt-badge-status-new')).not.toBeNull();
  });

  // UI-09 - AC-16, AC-17
  it('shows the empty state, not the no-results state, when the Requester owns nothing', async () => {
    selectStoredRequester();
    mockApi([page([])]);

    renderMyTickets();

    expect(await screen.findByText(/haven't created any tickets yet/i)).toBeInTheDocument();
    expect(screen.queryByText(/no tickets match/i)).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /create ticket/i })).toBeInTheDocument();
  });

  it('shows the no-results state with a Clear filters action once a search matches nothing', async () => {
    selectStoredRequester();
    mockApi([page([ticket(1)]), page([])]);

    renderMyTickets();
    await screen.findByRole('table');

    fireEvent.change(screen.getByLabelText(/search/i), { target: { value: 'nothing matches this' } });
    fireEvent.click(screen.getByRole('button', { name: /^search$/i }));

    expect(await screen.findByText(/no tickets match/i)).toBeInTheDocument();
    expect(screen.queryByText(/haven't created any tickets yet/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /clear filters/i })).toBeInTheDocument();
  });

  // UI-10 - AC-18, AC-19, AC-20
  it('requests the chosen sort field and order (AC-19)', async () => {
    selectStoredRequester();
    const spy = mockApi([page([ticket(1)])]);

    renderMyTickets();
    await screen.findByRole('table');

    fireEvent.change(screen.getByLabelText(/sort by/i), { target: { value: 'updatedAt' } });
    await waitFor(() => expect(ticketListUrls(spy).at(-1)).toContain('sort=updatedAt'));

    fireEvent.change(screen.getByLabelText(/order/i), { target: { value: 'asc' } });
    await waitFor(() => expect(ticketListUrls(spy).at(-1)).toContain('order=asc'));
  });

  it('requests the chosen Category filter (AC-20)', async () => {
    selectStoredRequester();
    const spy = mockApi([page([ticket(1)])]);

    renderMyTickets();
    await screen.findByRole('table');

    fireEvent.change(await screen.findByLabelText(/category/i), { target: { value: '2' } });

    await waitFor(() => expect(ticketListUrls(spy).at(-1)).toContain('category=2'));
  });

  it('requests the next page and shows the current position (AC-18)', async () => {
    selectStoredRequester();
    const spy = mockApi([page([ticket(1)], { totalItems: 12, totalPages: 3 })]);

    renderMyTickets();
    await screen.findByRole('table');

    fireEvent.click(screen.getByRole('button', { name: /next/i }));

    await waitFor(() => expect(ticketListUrls(spy).at(-1)).toContain('page=2'));
  });

  it('returns to page 1 when a filter changes, so the view cannot land past the last page', async () => {
    selectStoredRequester();
    const spy = mockApi([page([ticket(1)], { totalItems: 30, totalPages: 3 })]);

    renderMyTickets();
    await screen.findByRole('table');

    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    await waitFor(() => expect(ticketListUrls(spy).at(-1)).toContain('page=2'));

    fireEvent.change(await screen.findByLabelText(/category/i), { target: { value: '2' } });

    await waitFor(() => {
      const url = ticketListUrls(spy).at(-1)!;
      expect(url).toContain('category=2');
      expect(url).toContain('page=1');
    });
  });

  it('shows a safe error with a retry action when the list request fails', async () => {
    selectStoredRequester();
    vi.spyOn(global, 'fetch').mockImplementation((input: RequestInfo | URL) => {
      if (String(input).includes('/api/tickets')) {
        return Promise.reject(new TypeError('Failed to fetch'));
      }
      return Promise.resolve({ ok: true, json: async () => [] } as Response);
    });

    renderMyTickets();

    expect(await screen.findByRole('alert')).toHaveTextContent(/unable to/i);
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
    expect(screen.queryByText(/haven't created any tickets yet/i)).not.toBeInTheDocument();
  });

  // UI-11 - AC-15, BR-07: switching Requester never merges data
  it('drops the previous Requester’s rows after a switch', async () => {
    selectStoredRequester(1, 'Anong Srisai');
    const spy = mockApi([page([ticket(1)]), page([ticket(9)])]);

    render(
      <MemoryRouter>
        <RequesterProvider>
          <SwitchHarness />
        </RequesterProvider>
      </MemoryRouter>,
    );
    await screen.findByText('TKT-2026-000001');

    fireEvent.click(screen.getByRole('button', { name: /switch to b/i }));

    await screen.findByText('TKT-2026-000009');
    expect(screen.queryByText('TKT-2026-000001')).not.toBeInTheDocument();

    const lastCall = spy.mock.calls.filter(([input]) => String(input).includes('/api/tickets')).at(-1);
    const headers = (lastCall?.[1] as RequestInit | undefined)?.headers as Record<string, string>;
    expect(headers['X-Requester-Id']).toBe('2');
  });
});
