import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { RequesterProvider } from '../../src/context/RequesterContext';
import { RequesterTicketDetail } from '../../src/pages/RequesterTicketDetail';

const STORAGE_KEY = 'toktickit.selectedRequester';

function selectStoredRequester(id = 1, name = 'Anong Srisai') {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ id, name }));
}

const detail = (over: Record<string, unknown> = {}) => ({
  id: 42,
  ticketNumber: 'TKT-2026-000042',
  ticketDate: '2026-08-30T03:15:00.000Z',
  updatedAt: '2026-08-30T03:15:00.000Z',
  summary: 'Laptop battery drains quickly',
  description: 'Battery drops from 100% to 10% within an hour of unplugging.',
  requestedPriority: 'HIGH',
  currentStatus: 'NEW',
  category: { id: 1, name: 'Hardware' },
  relatedSystem: { id: 1, name: 'Campus Wi-Fi' },
  attachments: [],
  ...over,
});

function mockFetch(status: number, body: unknown) {
  return vi.spyOn(global, 'fetch').mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response);
}

function renderDetail(id = '42') {
  return render(
    <MemoryRouter initialEntries={[`/tickets/${id}`]}>
      <RequesterProvider>
        <Routes>
          <Route path="/tickets/:id" element={<RequesterTicketDetail />} />
        </Routes>
      </RequesterProvider>
    </MemoryRouter>,
  );
}

describe('RequesterTicketDetail', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    sessionStorage.clear();
  });

  it('shows a loading state while the request is in flight', () => {
    selectStoredRequester();
    vi.spyOn(global, 'fetch').mockImplementation(() => new Promise(() => {}));

    renderDetail();

    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  // UI-12 - AC-21: all fields render read-only, no editable controls
  it('renders every Ticket field as read-only, with no editable control', async () => {
    selectStoredRequester();
    mockFetch(200, detail());

    renderDetail();

    expect(await screen.findByDisplayValue('TKT-2026-000042')).toHaveAttribute('readonly');
    expect(screen.getByDisplayValue('Hardware')).toHaveAttribute('readonly');
    expect(screen.getByDisplayValue('Campus Wi-Fi')).toHaveAttribute('readonly');
    expect(screen.getByDisplayValue('Laptop battery drains quickly')).toHaveAttribute('readonly');
    expect(
      screen.getByDisplayValue('Battery drops from 100% to 10% within an hour of unplugging.'),
    ).toHaveAttribute('readonly');
    expect(screen.getByText(/^high$/i)).toBeInTheDocument();
    expect(screen.getByText(/^new$/i)).toBeInTheDocument();
    // No editable control anywhere on the screen.
    expect(document.querySelector('input:not([readonly])')).toBeNull();
    expect(document.querySelector('select')).toBeNull();
    expect(document.querySelector('textarea:not([readonly])')).toBeNull();
  });

  it('requests the Ticket with the current Requester header', async () => {
    selectStoredRequester(7, 'Suphachai Wattana');
    const spy = mockFetch(200, detail());

    renderDetail('42');
    await screen.findByDisplayValue('TKT-2026-000042');

    const [url, init] = spy.mock.calls[0];
    expect(String(url)).toBe('/api/tickets/42');
    expect((init as RequestInit).headers).toMatchObject({ 'X-Requester-Id': '7' });
  });

  it('provides navigation back to My Tickets', async () => {
    selectStoredRequester();
    mockFetch(200, detail());

    renderDetail();

    expect(await screen.findByRole('link', { name: /back to my tickets/i })).toHaveAttribute(
      'href',
      '/my-tickets',
    );
  });

  // UI-13 - BR-22: a 403/404 response shows a safe message, no partial Ticket data
  it('shows a safe not-found message and no Ticket data on 404', async () => {
    selectStoredRequester();
    mockFetch(404, { error: { code: 'NOT_FOUND', message: 'Ticket not found' } });

    renderDetail();

    expect(await screen.findByText(/does not exist/i)).toBeInTheDocument();
    expect(screen.queryByDisplayValue(/TKT-/)).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /back to my tickets/i })).toBeInTheDocument();
  });

  it('shows a safe forbidden message and no Ticket data on 403, never the raw response', async () => {
    selectStoredRequester();
    mockFetch(403, { error: { code: 'FORBIDDEN', message: 'This Ticket does not belong to you' } });

    renderDetail();

    expect(await screen.findByText(/don't have access/i)).toBeInTheDocument();
    expect(screen.queryByText(/FORBIDDEN/)).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue(/TKT-/)).not.toBeInTheDocument();
  });

  it('shows a safe error with retry when the request fails outright', async () => {
    selectStoredRequester();
    vi.spyOn(global, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));

    renderDetail();

    expect(await screen.findByRole('alert')).toHaveTextContent(/unable to/i);
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });
});
