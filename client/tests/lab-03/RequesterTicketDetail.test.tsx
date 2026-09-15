import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, waitFor, within, cleanup, fireEvent } from '@testing-library/react';
import { Routes, Route } from 'react-router-dom';
import { RequesterTicketDetail } from '../../src/pages/RequesterTicketDetail';
import { renderWithAuth, withAuthMe, MOCK_REQUESTER } from '../support/auth-mock';

// UI-08 (AC-17, BR-05) and the Requester's Public Comments panel (ui-spec.md 5), added to the Lab 2
// Requester Ticket Detail in Lab 3. The Lab 2 behaviour of this screen stays covered by
// client/tests/lab-02/RequesterTicketDetail.test.tsx.
const detail = (over: Record<string, unknown> = {}) => ({
  id: 42,
  ticketNumber: 'TKT-2026-000042',
  ticketDate: '2026-09-10T03:15:00.000Z',
  updatedAt: '2026-09-11T08:00:00.000Z',
  summary: 'Printer jams on duplex',
  description: 'Every double-sided job jams on page two.',
  requestedPriority: 'MEDIUM',
  currentStatus: 'IN_PROGRESS',
  requesterConfirmedAt: null,
  category: { id: 1, name: 'Hardware' },
  relatedSystem: { id: 2, name: 'Library printers' },
  attachments: [],
  ...over,
});

const ok = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body }) as Response;

type Handler = (body: unknown) => Response | Promise<Response>;

/** Routes each fetch by "METHOD path"; anything unlisted - including any notes request - fails the test. */
function mockApi(routes: Record<string, Handler>) {
  return vi.spyOn(global, 'fetch').mockImplementation(
    withAuthMe(MOCK_REQUESTER, async (input, init) => {
      const url = new URL(String(input), 'http://localhost');
      const method = (init?.method ?? 'GET').toUpperCase();
      const handler = routes[`${method} ${url.pathname}`];
      if (!handler) throw new Error(`Unexpected fetch: ${method} ${url.pathname}`);
      return handler(init?.body ? JSON.parse(String(init.body)) : undefined);
    }),
  );
}

const callsTo = (spy: ReturnType<typeof mockApi>, method: string, path: string) =>
  spy.mock.calls.filter(([input, init]) => new URL(String(input), 'http://localhost').pathname === path && (init?.method ?? 'GET').toUpperCase() === method);

function renderDetail() {
  return renderWithAuth(
    <Routes>
      <Route path="/tickets/:id" element={<RequesterTicketDetail />} />
    </Routes>,
    ['/tickets/42'],
  );
}

describe('RequesterTicketDetail - Lab 3 additions', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  describe('"Problem Appears Resolved" (UI-08)', () => {
    it('UI-08: asks for confirmation, records the signal, and leaves the status badge unchanged', async () => {
      const spy = mockApi({
        'GET /api/tickets/42': () => ok(detail()),
        'GET /api/tickets/42/comments': () => ok([]),
        'POST /api/tickets/42/resolution-signal': () =>
          ok({ id: 42, ticketNumber: 'TKT-2026-000042', currentStatus: 'IN_PROGRESS', requesterConfirmedAt: '2026-09-12T01:00:00.000Z' }),
      });
      const { container } = renderDetail();

      fireEvent.click(await screen.findByRole('button', { name: /problem appears resolved/i }));
      const dialog = await screen.findByRole('dialog');
      expect(dialog).toHaveClass('tt-confirm-dialog');
      expect(callsTo(spy, 'POST', '/api/tickets/42/resolution-signal')).toHaveLength(0);

      fireEvent.click(within(dialog).getByRole('button', { name: /yes, let them know/i }));

      expect(await screen.findByRole('status')).toHaveTextContent(/it staff can now see/i);
      expect(callsTo(spy, 'POST', '/api/tickets/42/resolution-signal')).toHaveLength(1);
      // BR-05: still In Progress - only IT Staff formally resolve.
      expect(container.querySelector('.tt-badge-status-in-progress')).not.toBeNull();
      expect(container.querySelector('.tt-badge-status-resolved')).toBeNull();
      expect(screen.getByText('Requester confirmed')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /problem appears resolved/i })).not.toBeInTheDocument();
    });

    it('sends nothing when the Requester goes back', async () => {
      const spy = mockApi({
        'GET /api/tickets/42': () => ok(detail()),
        'GET /api/tickets/42/comments': () => ok([]),
      });
      renderDetail();

      fireEvent.click(await screen.findByRole('button', { name: /problem appears resolved/i }));
      fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: /go back/i }));

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(callsTo(spy, 'POST', '/api/tickets/42/resolution-signal')).toHaveLength(0);
    });

    it('shows the Requester confirmed tag instead of the button once the signal was sent', async () => {
      mockApi({
        'GET /api/tickets/42': () => ok(detail({ requesterConfirmedAt: '2026-09-12T01:00:00.000Z' })),
        'GET /api/tickets/42/comments': () => ok([]),
      });
      renderDetail();

      expect(await screen.findByText('Requester confirmed')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /problem appears resolved/i })).not.toBeInTheDocument();
    });

    it('offers no signal on a Closed or Cancelled Ticket', async () => {
      for (const currentStatus of ['CLOSED', 'CANCELLED']) {
        mockApi({
          'GET /api/tickets/42': () => ok(detail({ currentStatus })),
          'GET /api/tickets/42/comments': () => ok([]),
        });
        renderDetail();

        await screen.findByDisplayValue('TKT-2026-000042');
        expect(screen.queryByRole('button', { name: /problem appears resolved/i }), currentStatus).not.toBeInTheDocument();
        cleanup();
        vi.restoreAllMocks();
      }
    });

    it('shows the server’s message when the signal is refused', async () => {
      mockApi({
        'GET /api/tickets/42': () => ok(detail()),
        'GET /api/tickets/42/comments': () => ok([]),
        'POST /api/tickets/42/resolution-signal': () => ok({ error: { code: 'TICKET_CLOSED', message: 'This Ticket is already closed' } }, 409),
      });
      renderDetail();

      fireEvent.click(await screen.findByRole('button', { name: /problem appears resolved/i }));
      fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: /yes, let them know/i }));

      expect(await screen.findByRole('alert')).toHaveTextContent('This Ticket is already closed');
    });
  });

  describe('Public Comments panel (ui-spec.md 5)', () => {
    it('lists the Ticket’s comments, posts a new one, and never requests Internal Notes', async () => {
      const spy = mockApi({
        'GET /api/tickets/42': () => ok(detail()),
        'GET /api/tickets/42/comments': () =>
          ok([{ id: 1, ticketId: 42, authorId: 12, author: { id: 12, name: 'Jane Lee', role: 'IT_STAFF' }, body: 'Replacing the roller today.', createdAt: '2026-09-11T08:00:00.000Z' }]),
        'POST /api/tickets/42/comments': (body) =>
          ok({ id: 2, ticketId: 42, authorId: 1, author: { id: 1, name: 'Anong Srisai', role: 'REQUESTER' }, body: (body as { body: string }).body, createdAt: '2026-09-11T09:00:00.000Z' }, 201),
      });
      renderDetail();

      const existing = (await screen.findByText('Replacing the roller today.')).closest('.tt-comment-public');
      expect(existing).not.toBeNull();

      fireEvent.change(screen.getByLabelText(/add a public comment/i), { target: { value: 'Thanks, it works now.' } });
      fireEvent.click(screen.getByRole('button', { name: /post comment/i }));

      expect(await screen.findByText('Thanks, it works now.', { selector: '.tt-comment-public *' })).toBeInTheDocument();
      await waitFor(() => expect(callsTo(spy, 'POST', '/api/tickets/42/comments')).toHaveLength(1));
      expect(spy.mock.calls.some(([input]) => String(input).includes('/notes'))).toBe(false);
      expect(screen.queryByText(/internal/i)).not.toBeInTheDocument();
    });
  });
});
