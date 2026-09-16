import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, waitFor, within, cleanup, fireEvent } from '@testing-library/react';
import { Routes, Route } from 'react-router-dom';
import { StaffTicketDetail } from '../../src/pages/StaffTicketDetail';
import { renderWithAuth, withAuthMe } from '../support/auth-mock';
import type { AuthUser } from '../../src/context/AuthContext';

// UI-04 (AC-12) and UI-05 (AC-26), plus the Staff Ticket Detail behaviour ui-spec.md 7/10 asks
// for: loading, not-found and safe failure; claim, reassign, IT Priority and status with their
// feedback; Public Comments vs. Internal Notes; read-only Attachments.
const ME: AuthUser = { id: 12, name: 'Jane Lee', email: 'jane.lee@toktickit.dev', role: 'IT_STAFF', mustChangePassword: false };

const ticket = (over: Record<string, unknown> = {}) => ({
  id: 42,
  ticketNumber: 'TKT-2026-000042',
  ticketDate: '2026-09-10T03:15:00.000Z',
  createdAt: '2026-09-10T03:15:00.000Z',
  updatedAt: '2026-09-11T08:00:00.000Z',
  summary: 'Printer jams on duplex',
  description: 'Every double-sided job jams on page two.',
  requestedPriority: 'MEDIUM',
  itPriority: 'MEDIUM',
  currentStatus: 'OPEN',
  requesterConfirmedAt: null,
  requester: { id: 3, name: 'Somchai Dee', email: 'somchai.dee@toktickit.dev' },
  owner: { id: 12, name: 'Jane Lee' },
  category: { id: 1, name: 'Hardware' },
  relatedSystem: { id: 2, name: 'Library printers' },
  attachments: [],
  ...over,
});

const entry = (id: number, body: string, role = 'IT_STAFF') => ({
  id,
  ticketId: 42,
  authorId: 12,
  author: { id: 12, name: 'Jane Lee', role },
  body,
  createdAt: '2026-09-11T08:00:00.000Z',
});

const ok = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body }) as Response;

type Handler = (method: string, body: unknown) => Response | Promise<Response>;

/** Routes each fetch by "METHOD path"; unlisted requests fail the test. Returns the spy. */
function mockApi(routes: Record<string, Handler>) {
  return vi.spyOn(global, 'fetch').mockImplementation(
    withAuthMe(ME, async (input, init) => {
      const url = new URL(String(input), 'http://localhost');
      const method = (init?.method ?? 'GET').toUpperCase();
      const handler = routes[`${method} ${url.pathname}`];
      if (!handler) throw new Error(`Unexpected fetch: ${method} ${url.pathname}`);
      return handler(method, init?.body ? JSON.parse(String(init.body)) : undefined);
    }),
  );
}

function baseRoutes(detail: ReturnType<typeof ticket>, extra: Record<string, Handler> = {}): Record<string, Handler> {
  return {
    'GET /api/staff/tickets/42': () => ok(detail),
    'GET /api/staff/assignable-users': () => ok([{ id: 12, name: 'Jane Lee' }, { id: 13, name: 'Wiriya Charoen' }]),
    'GET /api/tickets/42/comments': () => ok([]),
    'GET /api/tickets/42/notes': () => ok([]),
    ...extra,
  };
}

const callsTo = (spy: ReturnType<typeof mockApi>, method: string, path: string) =>
  spy.mock.calls.filter(([input, init]) => {
    const url = new URL(String(input), 'http://localhost');
    return url.pathname === path && (init?.method ?? 'GET').toUpperCase() === method;
  });

function renderDetail() {
  return renderWithAuth(
    <Routes>
      <Route path="/staff/tickets/:id" element={<StaffTicketDetail />} />
    </Routes>,
    ['/staff/tickets/42'],
  );
}

describe('StaffTicketDetail', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  describe('loading, not-found and failure', () => {
    it('shows a loading state while the Ticket is requested', async () => {
      vi.spyOn(global, 'fetch').mockImplementation(withAuthMe(ME, () => new Promise(() => {})));
      renderDetail();
      expect(await screen.findByText(/loading/i)).toBeInTheDocument();
    });

    it('shows the Ticket read-only, with the requester, both priorities and a Requester confirmed tag', async () => {
      const spy = mockApi(baseRoutes(ticket({ requesterConfirmedAt: '2026-09-12T01:00:00.000Z' })));
      const { container } = renderDetail();

      expect(await screen.findByDisplayValue('TKT-2026-000042')).toHaveAttribute('readonly');
      expect(screen.getByDisplayValue('Printer jams on duplex')).toHaveAttribute('readonly');
      expect(screen.getByText('Somchai Dee')).toBeInTheDocument();
      expect(screen.getByText('somchai.dee@toktickit.dev')).toBeInTheDocument();
      expect(screen.getByText('Requester confirmed')).toBeInTheDocument();
      expect(container.querySelector('.tt-badge-status-open')).not.toBeNull();

      const detailCall = callsTo(spy, 'GET', '/api/staff/tickets/42')[0];
      expect((detailCall[1] as RequestInit).credentials).toBe('include');
    });

    it('shows a not-found message for a 404, with a way back to the Queue', async () => {
      mockApi(baseRoutes(ticket(), { 'GET /api/staff/tickets/42': () => ok({ error: { code: 'NOT_FOUND' } }, 404) }));
      renderDetail();

      expect(await screen.findByText(/does not exist/i)).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /back to my queue/i })).toHaveAttribute('href', '/staff/queue');
    });

    it('shows a safe error with Try again when the request fails', async () => {
      mockApi(baseRoutes(ticket(), { 'GET /api/staff/tickets/42': () => Promise.reject(new TypeError('Failed to fetch')) }));
      renderDetail();

      expect(await screen.findByRole('alert')).toHaveTextContent(/unable to load this ticket/i);
      expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
    });
  });

  describe('ownership and IT Priority', () => {
    it('claims an unassigned New Ticket and shows the new owner with a success message', async () => {
      const unassigned = ticket({ currentStatus: 'NEW', owner: null });
      const spy = mockApi(baseRoutes(unassigned, {
        'POST /api/staff/tickets/42/claim': () => ok(ticket({ currentStatus: 'OPEN', owner: { id: 12, name: 'Jane Lee' } })),
      }));
      renderDetail();

      fireEvent.click(await screen.findByRole('button', { name: /^claim$/i }));

      expect(await screen.findByRole('status')).toHaveTextContent(/ticket claimed/i);
      expect(callsTo(spy, 'POST', '/api/staff/tickets/42/claim')).toHaveLength(1);
      expect(screen.queryByRole('button', { name: /^claim$/i })).not.toBeInTheDocument();
    });

    it('reassigns to the chosen IT Staff member', async () => {
      const spy = mockApi(baseRoutes(ticket(), {
        'POST /api/staff/tickets/42/reassign': (_m, body) => ok(ticket({ owner: { id: (body as { newOwnerId: number }).newOwnerId, name: 'Wiriya Charoen' } })),
      }));
      renderDetail();

      // The staff list loads after the Ticket. Choosing before its option exists selects nothing, which
      // left Reassign disabled and made this test fail intermittently under full-suite load.
      await screen.findByRole('option', { name: 'Wiriya Charoen' });
      fireEvent.change(screen.getByLabelText(/assign to/i), { target: { value: '13' } });
      fireEvent.click(screen.getByRole('button', { name: /^reassign$/i }));

      expect(await screen.findByRole('status')).toHaveTextContent(/reassigned/i);
      const [call] = callsTo(spy, 'POST', '/api/staff/tickets/42/reassign');
      expect(JSON.parse(String((call[1] as RequestInit).body))).toEqual({ newOwnerId: 13 });
    });

    it('saves IT Priority when it changes', async () => {
      const spy = mockApi(baseRoutes(ticket(), {
        'PATCH /api/staff/tickets/42/priority': () => ok(ticket({ itPriority: 'HIGH' })),
      }));
      renderDetail();

      fireEvent.change(await screen.findByLabelText(/^it priority$/i), { target: { value: 'HIGH' } });

      expect(await screen.findByRole('status')).toHaveTextContent(/it priority updated/i);
      const [call] = callsTo(spy, 'PATCH', '/api/staff/tickets/42/priority');
      expect(JSON.parse(String((call[1] as RequestInit).body))).toEqual({ itPriority: 'HIGH' });
    });
  });

  describe('status', () => {
    // UI-04 - AC-12, ui-spec.md 7
    it('UI-04: when the viewer is not the owner, owner-required options are disabled with a tooltip, not hidden', async () => {
      mockApi(baseRoutes(ticket({ owner: { id: 13, name: 'Wiriya Charoen' } })));
      renderDetail();

      const select = await screen.findByLabelText(/change status/i);
      const inProgress = within(select).getByRole('option', { name: 'In Progress' }) as HTMLOptionElement;
      expect(inProgress.disabled).toBe(true);
      expect(inProgress).toHaveAttribute('title', 'Claim this ticket first');
      expect(inProgress).toHaveClass('tt-disabled-not-owner');

      // Cancel doesn't need ownership (BR-14), so it stays available.
      const cancelled = within(select).getByRole('option', { name: 'Cancelled' }) as HTMLOptionElement;
      expect(cancelled.disabled).toBe(false);
    });

    it('offers only the transitions the matrix allows from the current status', async () => {
      mockApi(baseRoutes(ticket({ currentStatus: 'OPEN' })));
      renderDetail();

      const select = await screen.findByLabelText(/change status/i);
      const offered = within(select).getAllByRole('option').map((option) => option.textContent).filter((text) => !/choose/i.test(text ?? ''));
      expect(offered).toEqual(['In Progress', 'Cancelled']);
    });

    it('lets the owner change status and shows the new status', async () => {
      const spy = mockApi(baseRoutes(ticket(), {
        'PATCH /api/staff/tickets/42/status': () => ok(ticket({ currentStatus: 'IN_PROGRESS' })),
      }));
      const { container } = renderDetail();

      fireEvent.change(await screen.findByLabelText(/change status/i), { target: { value: 'IN_PROGRESS' } });
      fireEvent.click(screen.getByRole('button', { name: /update status/i }));

      expect(await screen.findByRole('status')).toHaveTextContent(/status updated/i);
      expect(container.querySelector('.tt-badge-status-in-progress')).not.toBeNull();
      const [call] = callsTo(spy, 'PATCH', '/api/staff/tickets/42/status');
      expect(JSON.parse(String((call[1] as RequestInit).body))).toEqual({ status: 'IN_PROGRESS' });
    });

    it('asks for confirmation before Cancelling, and sends nothing if the user goes back (BR-18)', async () => {
      const spy = mockApi(baseRoutes(ticket(), {
        'PATCH /api/staff/tickets/42/status': () => ok(ticket({ currentStatus: 'CANCELLED' })),
      }));
      renderDetail();

      fireEvent.change(await screen.findByLabelText(/change status/i), { target: { value: 'CANCELLED' } });
      fireEvent.click(screen.getByRole('button', { name: /update status/i }));

      const dialog = await screen.findByRole('dialog');
      expect(dialog).toHaveClass('tt-confirm-dialog');
      fireEvent.click(within(dialog).getByRole('button', { name: /go back/i }));
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(callsTo(spy, 'PATCH', '/api/staff/tickets/42/status')).toHaveLength(0);

      fireEvent.click(screen.getByRole('button', { name: /update status/i }));
      fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: /^confirm$/i }));
      await waitFor(() => expect(callsTo(spy, 'PATCH', '/api/staff/tickets/42/status')).toHaveLength(1));
    });

    it('shows the server’s conflict message when a change is refused, and keeps the current status', async () => {
      mockApi(baseRoutes(ticket(), {
        'PATCH /api/staff/tickets/42/status': () =>
          ok({ error: { code: 'INVALID_TRANSITION', message: 'This Ticket changed while you were working on it. Reload and try again.' } }, 409),
      }));
      const { container } = renderDetail();

      fireEvent.change(await screen.findByLabelText(/change status/i), { target: { value: 'IN_PROGRESS' } });
      fireEvent.click(screen.getByRole('button', { name: /update status/i }));

      expect(await screen.findByRole('alert')).toHaveTextContent(/changed while you were working on it/i);
      expect(container.querySelector('.tt-badge-status-open')).not.toBeNull();
    });
  });

  describe('Public Comments, Internal Notes and Attachments', () => {
    it('shows Public Comments and Internal Notes on separate tabs, with visibly different cards', async () => {
      mockApi(baseRoutes(ticket(), {
        'GET /api/tickets/42/comments': () => ok([entry(1, 'Replacing the roller today.')]),
        'GET /api/tickets/42/notes': () => ok([entry(2, 'Spare roller is in the IT store.')]),
      }));
      renderDetail();

      const comment = (await screen.findByText('Replacing the roller today.')).closest('.tt-comment-public');
      expect(comment).not.toBeNull();

      fireEvent.click(screen.getByRole('tab', { name: /internal notes/i }));
      const note = (await screen.findByText('Spare roller is in the IT store.')).closest('.tt-note-internal');
      expect(note).not.toBeNull();
      expect(within(note as HTMLElement).getByText('Internal — not visible to Requester')).toBeInTheDocument();
      expect(note).not.toHaveClass('tt-comment-public');
    });

    // UI-05 - AC-26, BR-16
    it('UI-05: renders HTML-like comment and note text literally, never as markup', async () => {
      const markup = '<script>alert(1)</script><b>bold</b>';
      mockApi(baseRoutes(ticket(), {
        'GET /api/tickets/42/comments': () => ok([entry(1, markup)]),
        'GET /api/tickets/42/notes': () => ok([entry(2, markup)]),
      }));
      const { container } = renderDetail();

      expect(await screen.findByText(markup)).toBeInTheDocument();
      fireEvent.click(screen.getByRole('tab', { name: /internal notes/i }));
      expect(await screen.findByText(markup)).toBeInTheDocument();
      expect(container.querySelector('script')).toBeNull();
      expect(container.querySelector('b')).toBeNull();
    });

    it('keeps Post disabled for empty or whitespace-only text, counts characters, and adds a posted note', async () => {
      const spy = mockApi(baseRoutes(ticket(), {
        'POST /api/tickets/42/notes': (_m, body) => ok(entry(9, (body as { body: string }).body), 201),
      }));
      renderDetail();

      fireEvent.click(await screen.findByRole('tab', { name: /internal notes/i }));
      const composer = screen.getByLabelText(/add an internal note/i);
      const post = screen.getByRole('button', { name: /post note/i });
      expect(post).toBeDisabled();

      fireEvent.change(composer, { target: { value: '   ' } });
      expect(post).toBeDisabled();

      fireEvent.change(composer, { target: { value: 'Ordered a new roller.' } });
      expect(screen.getByText('21 / 2000')).toBeInTheDocument();
      expect(post).toBeEnabled();
      fireEvent.click(post);

      expect(await screen.findByText('Ordered a new roller.', { selector: '.tt-note-internal *' })).toBeInTheDocument();
      const [call] = callsTo(spy, 'POST', '/api/tickets/42/notes');
      expect(JSON.parse(String((call[1] as RequestInit).body))).toEqual({ body: 'Ordered a new roller.' });
    });

    it('lists Attachments read-only, downloading through the staff endpoint', async () => {
      mockApi(baseRoutes(ticket({
        attachments: [
          { id: 5, ticketId: 42, originalFilename: 'jam.jpg', mimeType: 'image/jpeg', sizeBytes: 2048, uploadedAt: '2026-09-10T03:20:00.000Z', isActive: true, removedAt: null, removalReason: null },
          { id: 6, ticketId: 42, originalFilename: 'old.pdf', mimeType: 'application/pdf', sizeBytes: 4096, uploadedAt: '2026-09-10T03:21:00.000Z', isActive: false, removedAt: '2026-09-10T04:00:00.000Z', removalReason: 'Wrong file' },
        ],
      })));
      renderDetail();

      fireEvent.click(await screen.findByRole('tab', { name: /attachments/i }));
      expect(screen.getByRole('link', { name: /download jam\.jpg/i })).toHaveAttribute('href', '/api/staff/attachments/5/download');
      expect(screen.getByText(/old\.pdf — Removed/)).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /remove/i })).not.toBeInTheDocument();
      expect(screen.queryByLabelText(/add attachment/i)).not.toBeInTheDocument();
    });
  });
});
