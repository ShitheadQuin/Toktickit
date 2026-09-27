import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor, within, cleanup, fireEvent } from '@testing-library/react';
import { ActionsTakenSection } from '../../src/components/ActionsTaken';

// docs/lab-04/ui-spec.md 7 and 10: the Actions Taken section. UI-03 to UI-06 cover the staff
// create and view/edit modes, UI-10 the Requester's read-only list.

const action = (over: Record<string, unknown> = {}) => ({
  id: 31,
  ticketId: 42,
  actionAt: '2026-10-08T03:20:00.000Z',
  description: 'Checked the laptop charger',
  result: null,
  status: 'PLANNED',
  performedBy: { id: 12, name: 'Pimchanok Rattana' },
  assignee: { id: 12, name: 'Pimchanok Rattana' },
  followUpRequired: false,
  followUpNote: null,
  attachmentNotes: null,
  version: 0,
  createdAt: '2026-10-08T03:21:00.000Z',
  updatedAt: '2026-10-08T03:21:00.000Z',
  ...over,
});

const ASSIGNEES = [
  { id: 12, name: 'Pimchanok Rattana' },
  { id: 13, name: 'Wiriya Charoen' },
];

const ok = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body }) as Response;

type Handler = (body: Record<string, unknown> | undefined) => Response | Promise<Response>;

function mockApi(routes: Record<string, Handler>) {
  return vi.spyOn(global, 'fetch').mockImplementation(async (input, init) => {
    const url = new URL(String(input), 'http://localhost');
    const method = (init?.method ?? 'GET').toUpperCase();
    const handler = routes[`${method} ${url.pathname}`];
    if (!handler) throw new Error(`Unexpected fetch: ${method} ${url.pathname}`);
    return handler(init?.body ? JSON.parse(String(init.body)) : undefined);
  });
}

const bodiesOf = (spy: ReturnType<typeof mockApi>, method: string, path: string) =>
  spy.mock.calls
    .filter(([input, init]) => new URL(String(input), 'http://localhost').pathname === path && (init?.method ?? 'GET').toUpperCase() === method)
    .map(([, init]) => JSON.parse(String(init!.body)));

function renderStaff(over: Partial<Parameters<typeof ActionsTakenSection>[0]> = {}) {
  return render(
    <ActionsTakenSection ticketId={42} editable ticketClosed={false} assignees={ASSIGNEES} currentUser={{ id: 12, name: 'Pimchanok Rattana' }} {...over} />,
  );
}

async function openAddForm() {
  fireEvent.click(await screen.findByRole('button', { name: /add action/i }));
  return screen.getByRole('form', { name: /add action/i });
}

describe('ActionsTakenSection', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  describe('list mode', () => {
    it('lists every Action with date, description, assignee, status badge, follow up and performer', async () => {
      mockApi({
        'GET /api/tickets/42/actions': () =>
          ok([
            action(),
            action({ id: 32, description: 'Replaced the battery', status: 'COMPLETED', result: 'Holds charge', followUpRequired: true, followUpNote: 'Check next week', assignee: { id: 13, name: 'Wiriya Charoen' } }),
          ]),
      });
      const { container } = renderStaff();

      expect(await screen.findByText('Checked the laptop charger')).toBeInTheDocument();
      expect(screen.getByText('Replaced the battery')).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: /actions taken \(2\)/i })).toBeInTheDocument();
      expect(container.querySelector('.tt-badge-action-planned')).toHaveTextContent('Planned');
      expect(container.querySelector('.tt-badge-action-completed')).toHaveTextContent('Completed');
      expect(container.querySelector('.tt-flag-follow-up')).toHaveTextContent(/follow up/i);
      expect(screen.getAllByText('Wiriya Charoen').length).toBeGreaterThan(0);
    });

    it('shows the empty text and the Add Action button when there are no Actions', async () => {
      mockApi({ 'GET /api/tickets/42/actions': () => ok([]) });
      renderStaff();
      expect(await screen.findByText(/no actions recorded yet/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /add action/i })).toBeInTheDocument();
    });

    it('shows a safe message with Try again when the list cannot be loaded', async () => {
      mockApi({ 'GET /api/tickets/42/actions': () => Promise.reject(new TypeError('Failed to fetch')) });
      renderStaff();
      expect(await screen.findByText(/actions taken could not be loaded/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
    });

    it('offers no Add Action on a Closed or Cancelled Ticket', async () => {
      mockApi({ 'GET /api/tickets/42/actions': () => ok([action()]) });
      renderStaff({ ticketClosed: true });
      await screen.findByText('Checked the laptop charger');
      expect(screen.queryByRole('button', { name: /add action/i })).toBeNull();
    });
  });

  describe('create mode (UI-03, UI-04)', () => {
    it('creates an Action and adds it to the list with a success message', async () => {
      const spy = mockApi({
        'GET /api/tickets/42/actions': () => ok([]),
        'POST /api/staff/tickets/42/actions': (body) => ok(action({ description: String(body!.description), assignee: { id: 13, name: 'Wiriya Charoen' } }), 201),
      });
      renderStaff();
      const form = await openAddForm();

      expect(within(form).getByLabelText(/performed by/i)).toHaveValue('Pimchanok Rattana');
      expect(within(form).getByLabelText(/performed by/i)).toHaveAttribute('readonly');
      fireEvent.change(within(form).getByLabelText(/action description/i), { target: { value: 'Checked the laptop charger' } });
      fireEvent.change(within(form).getByLabelText(/assignee/i), { target: { value: '13' } });
      fireEvent.click(within(form).getByRole('button', { name: /save action/i }));

      expect(await screen.findByRole('status')).toHaveTextContent(/action saved/i);
      expect(screen.getByText('Checked the laptop charger')).toBeInTheDocument();
      const [sent] = bodiesOf(spy, 'POST', '/api/staff/tickets/42/actions');
      expect(sent).toMatchObject({ description: 'Checked the laptop charger', assigneeId: 13, status: 'PLANNED', followUpRequired: false });
      expect(typeof sent.clientRequestId).toBe('string');
      expect(sent).not.toHaveProperty('performedById');
    });

    it('marks Result as required once Completed is chosen, and shows the Follow Up Note only when ticked', async () => {
      mockApi({ 'GET /api/tickets/42/actions': () => ok([]) });
      renderStaff();
      const form = await openAddForm();

      expect(within(form).queryByLabelText(/follow up note/i)).toBeNull();
      fireEvent.click(within(form).getByLabelText(/follow up required/i));
      expect(within(form).getByLabelText(/follow up note/i)).toBeRequired();

      expect(within(form).getByLabelText(/^result/i)).not.toBeRequired();
      fireEvent.change(within(form).getByLabelText(/^status/i), { target: { value: 'COMPLETED' } });
      expect(within(form).getByLabelText(/^result/i)).toBeRequired();
    });

    it('shows each validation message under its own field and does not send an empty description', async () => {
      const spy = mockApi({ 'GET /api/tickets/42/actions': () => ok([]) });
      renderStaff();
      const form = await openAddForm();

      fireEvent.change(within(form).getByLabelText(/^status/i), { target: { value: 'COMPLETED' } });
      fireEvent.click(within(form).getByLabelText(/follow up required/i));
      fireEvent.click(within(form).getByRole('button', { name: /save action/i }));

      expect(await within(form).findByText(/action description is required/i)).toBeInTheDocument();
      expect(within(form).getByText(/result is required when the action is completed/i)).toBeInTheDocument();
      expect(within(form).getByText(/follow up note is required/i)).toBeInTheDocument();
      expect(within(form).getByLabelText(/action description/i)).toHaveAttribute('aria-invalid', 'true');
      expect(bodiesOf(spy, 'POST', '/api/staff/tickets/42/actions')).toHaveLength(0);
    });

    it('shows a server rejection of an inactive assignee under Assignee, keeping the input', async () => {
      mockApi({
        'GET /api/tickets/42/actions': () => ok([]),
        'POST /api/staff/tickets/42/actions': () =>
          ok({ error: { code: 'ASSIGNEE_INACTIVE', message: 'This person is inactive and cannot be assigned an Action.', fields: [{ field: 'assigneeId', message: 'This person is inactive and cannot be assigned an Action.' }] } }, 400),
      });
      renderStaff();
      const form = await openAddForm();
      fireEvent.change(within(form).getByLabelText(/action description/i), { target: { value: 'Swap the router' } });
      fireEvent.change(within(form).getByLabelText(/assignee/i), { target: { value: '13' } });
      fireEvent.click(within(form).getByRole('button', { name: /save action/i }));

      expect(await within(form).findByText(/inactive and cannot be assigned/i)).toBeInTheDocument();
      expect(within(form).getByLabelText(/action description/i)).toHaveValue('Swap the router');
    });

    it('keeps the typed input after a safe failure (AC-30)', async () => {
      mockApi({
        'GET /api/tickets/42/actions': () => ok([]),
        'POST /api/staff/tickets/42/actions': () => Promise.reject(new TypeError('Failed to fetch')),
      });
      renderStaff();
      const form = await openAddForm();
      fireEvent.change(within(form).getByLabelText(/action description/i), { target: { value: 'Swap the router' } });
      fireEvent.change(within(form).getByLabelText(/attachment notes/i), { target: { value: 'router.jpg' } });
      fireEvent.click(within(form).getByRole('button', { name: /save action/i }));

      expect(await within(form).findByRole('alert')).toHaveTextContent(/could not be saved.*entries are kept/i);
      expect(within(form).getByLabelText(/action description/i)).toHaveValue('Swap the router');
      expect(within(form).getByLabelText(/attachment notes/i)).toHaveValue('router.jpg');
    });

    it('sends one request for a double click, and reuses the same clientRequestId on retry (UI-04, AC-31)', async () => {
      let release: (value: Response) => void = () => {};
      let attempt = 0;
      const spy = mockApi({
        'GET /api/tickets/42/actions': () => ok([]),
        'POST /api/staff/tickets/42/actions': () => {
          attempt++;
          if (attempt === 1) return Promise.reject(new TypeError('Failed to fetch'));
          return new Promise<Response>((resolve) => {
            release = resolve;
          });
        },
      });
      renderStaff();
      const form = await openAddForm();
      fireEvent.change(within(form).getByLabelText(/action description/i), { target: { value: 'Swap the router' } });

      fireEvent.click(within(form).getByRole('button', { name: /save action/i }));
      await within(form).findByRole('alert');

      const save = within(form).getByRole('button', { name: /save action/i });
      fireEvent.click(save);
      await waitFor(() => expect(save).toBeDisabled());
      fireEvent.click(save);

      const bodies = bodiesOf(spy, 'POST', '/api/staff/tickets/42/actions');
      expect(bodies).toHaveLength(2);
      expect(bodies[1].clientRequestId).toBe(bodies[0].clientRequestId);

      release(ok(action({ description: 'Swap the router' }), 201));
      expect(await screen.findByRole('status')).toHaveTextContent(/action saved/i);
    });
  });

  describe('view and edit mode (UI-05, UI-06)', () => {
    it('edits a Planned Action, sending expectedVersion, and moves it to In Progress', async () => {
      const spy = mockApi({
        'GET /api/tickets/42/actions': () => ok([action()]),
        'PATCH /api/staff/actions/31': (body) => ok(action({ status: String(body!.status), version: 1 })),
      });
      const { container } = renderStaff();
      fireEvent.click(await screen.findByRole('button', { name: /open action: checked the laptop charger/i }));
      const form = screen.getByRole('form', { name: /edit action/i });

      fireEvent.change(within(form).getByLabelText(/^status/i), { target: { value: 'IN_PROGRESS' } });
      fireEvent.click(within(form).getByRole('button', { name: /save changes/i }));

      expect(await screen.findByRole('status')).toHaveTextContent(/action saved/i);
      expect(bodiesOf(spy, 'PATCH', '/api/staff/actions/31')[0]).toMatchObject({ expectedVersion: 0, status: 'IN_PROGRESS' });
      expect(container.querySelector('.tt-badge-action-in-progress')).not.toBeNull();
    });

    it('opens a Completed Action read-only, with no Save button (UI-05)', async () => {
      mockApi({ 'GET /api/tickets/42/actions': () => ok([action({ status: 'COMPLETED', result: 'Charger replaced' })]) });
      renderStaff();
      fireEvent.click(await screen.findByRole('button', { name: /open action/i }));
      const form = screen.getByRole('form', { name: /view action/i });

      expect(within(form).getByText(/completed actions cannot be changed/i)).toBeInTheDocument();
      expect(within(form).getByLabelText(/action description/i)).toHaveAttribute('readonly');
      expect(within(form).queryByRole('button', { name: /save/i })).toBeNull();
    });

    it('asks for confirmation before cancelling an Action (UI-05)', async () => {
      const spy = mockApi({
        'GET /api/tickets/42/actions': () => ok([action()]),
        'PATCH /api/staff/actions/31': () => ok(action({ status: 'CANCELLED', version: 1 })),
      });
      renderStaff();
      fireEvent.click(await screen.findByRole('button', { name: /open action/i }));
      const form = screen.getByRole('form', { name: /edit action/i });
      fireEvent.change(within(form).getByLabelText(/^status/i), { target: { value: 'CANCELLED' } });
      fireEvent.click(within(form).getByRole('button', { name: /save changes/i }));

      const dialog = await screen.findByRole('dialog');
      expect(dialog).toHaveTextContent(/cancel this action/i);
      expect(bodiesOf(spy, 'PATCH', '/api/staff/actions/31')).toHaveLength(0);

      fireEvent.click(within(dialog).getByRole('button', { name: /confirm/i }));
      await waitFor(() => expect(bodiesOf(spy, 'PATCH', '/api/staff/actions/31')).toHaveLength(1));
    });

    it('shows a stale-update warning with Reload and keeps the edits until Reload is chosen (UI-06, AC-12)', async () => {
      let listCalls = 0;
      mockApi({
        'GET /api/tickets/42/actions': () => {
          listCalls++;
          return ok([listCalls === 1 ? action() : action({ description: 'Changed by a colleague', version: 1 })]);
        },
        'PATCH /api/staff/actions/31': () =>
          ok({ error: { code: 'STALE_UPDATE', message: 'This Action changed while you were editing it. Reload to see the latest version.' } }, 409),
      });
      renderStaff();
      fireEvent.click(await screen.findByRole('button', { name: /open action/i }));
      const form = screen.getByRole('form', { name: /edit action/i });
      fireEvent.change(within(form).getByLabelText(/action description/i), { target: { value: 'My edit' } });
      fireEvent.click(within(form).getByRole('button', { name: /save changes/i }));

      expect(await within(form).findByText(/changed while you were editing/i)).toBeInTheDocument();
      expect(within(form).getByLabelText(/action description/i)).toHaveValue('My edit');

      fireEvent.click(within(form).getByRole('button', { name: /reload/i }));
      expect(await screen.findByText('Changed by a colleague')).toBeInTheDocument();
    });
  });

  describe('Requester view (UI-10, AC-05)', () => {
    it('lists every Action including Cancelled ones, with no form or buttons to change them', async () => {
      mockApi({
        'GET /api/tickets/42/actions': () =>
          ok([action(), action({ id: 33, description: 'Tried a workaround', status: 'CANCELLED', result: 'Not supported' })]),
      });
      const { container } = render(<ActionsTakenSection ticketId={42} editable={false} ticketClosed={false} assignees={[]} currentUser={null} />);

      expect(await screen.findByText('Tried a workaround')).toBeInTheDocument();
      expect(container.querySelector('.tt-badge-action-cancelled')).toHaveTextContent('Cancelled');
      expect(screen.queryByRole('button', { name: /add action/i })).toBeNull();
      expect(screen.queryByRole('button', { name: /open action/i })).toBeNull();
      expect(screen.queryByRole('form')).toBeNull();
    });
  });
});
