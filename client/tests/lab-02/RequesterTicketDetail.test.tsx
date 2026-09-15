import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, cleanup } from '@testing-library/react';
import { Routes, Route } from 'react-router-dom';
import { RequesterTicketDetail } from '../../src/pages/RequesterTicketDetail';
import { renderWithAuth, withAuthMe, MOCK_REQUESTER } from '../support/auth-mock';

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
  return vi.spyOn(global, 'fetch').mockImplementation(
    withAuthMe(MOCK_REQUESTER, async () => ({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    }) as Response),
  );
}

function renderDetail(id = '42') {
  return renderWithAuth(
    <Routes>
      <Route path="/tickets/:id" element={<RequesterTicketDetail />} />
    </Routes>,
    [`/tickets/${id}`],
  );
}

describe('RequesterTicketDetail', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('shows a loading state while the request is in flight', () => {
    vi.spyOn(global, 'fetch').mockImplementation(withAuthMe(MOCK_REQUESTER, () => new Promise(() => {})));

    renderDetail();

    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  // UI-12 - AC-21: all fields render read-only, no editable controls
  it('renders every Ticket field as read-only, with no editable control', async () => {
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
    // No editable Ticket-field control anywhere - the Attachment section's own file picker
    // (Issue #16, ui-spec.md 15) is a separate, intentionally interactive area below.
    expect(document.querySelector('input:not([readonly]):not([type="file"])')).toBeNull();
    expect(document.querySelector('select')).toBeNull();
    // Lab 3 (#38): the Public Comments composer is the one intentionally editable textarea here.
    expect(document.querySelector('textarea:not([readonly]):not(.tt-conversation-composer)')).toBeNull();
  });

  it('requests the Ticket via the session cookie, not a header', async () => {
    const spy = mockFetch(200, detail());

    renderDetail('42');
    await screen.findByDisplayValue('TKT-2026-000042');

    const call = spy.mock.calls.find(([input]) => String(input).includes('/api/tickets/42'));
    expect(call?.[0]).toBe('/api/tickets/42');
    expect((call?.[1] as RequestInit).credentials).toBe('include');
  });

  it('provides navigation back to My Tickets', async () => {
    mockFetch(200, detail());

    renderDetail();

    expect(await screen.findByRole('link', { name: /back to my tickets/i })).toHaveAttribute(
      'href',
      '/my-tickets',
    );
  });

  // UI-13 - BR-12 (Lab 3 supersedes Lab 2's 403 - see PR for Issue #36): a Ticket that doesn't
  // exist, and one that exists but belongs to someone else, are now the same 404 response and
  // the same safe message - there is no separate "forbidden" state anymore.
  it('shows a safe not-found message and no Ticket data on 404, whether missing or not owned', async () => {
    mockFetch(404, { error: { code: 'NOT_FOUND', message: 'Ticket not found' } });

    renderDetail();

    expect(await screen.findByText(/does not exist/i)).toBeInTheDocument();
    expect(screen.queryByDisplayValue(/TKT-/)).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /back to my tickets/i })).toBeInTheDocument();
  });

  it('shows a safe error with retry when the request fails outright', async () => {
    vi.spyOn(global, 'fetch').mockImplementation(
      withAuthMe(MOCK_REQUESTER, () => Promise.reject(new TypeError('Failed to fetch'))),
    );

    renderDetail();

    expect(await screen.findByRole('alert')).toHaveTextContent(/unable to/i);
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });
});
