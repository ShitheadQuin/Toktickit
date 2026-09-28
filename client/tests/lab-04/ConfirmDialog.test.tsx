import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, within, cleanup, fireEvent } from '@testing-library/react';
import { Routes, Route } from 'react-router-dom';
import { useState } from 'react';
import { ConfirmDialog } from '../../src/components/ConfirmDialog';
import { ActionsTakenSection } from '../../src/components/ActionsTaken';
import { StaffTicketDetail } from '../../src/pages/StaffTicketDetail';
import { RequesterTicketDetail } from '../../src/pages/RequesterTicketDetail';
import { renderWithAuth, withAuthMe, MOCK_REQUESTER } from '../support/auth-mock';
import type { AuthUser } from '../../src/context/AuthContext';

// UI-11 (AC-28), docs/lab-04/ui-spec.md 13: "the confirm dialog traps focus and closes with
// Escape", and labsheet 7 rules out inaccessible modal dialogs. Every confirm dialog in the app
// (Cancel Action, Cancel or Reopen Ticket, Problem Appears Resolved) uses ConfirmDialog.

function Harness({ onConfirm = () => {} }: { onConfirm?: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open
      </button>
      {open && (
        <ConfirmDialog
          title="Cancel this Action?"
          body="The Action is kept in the list as Cancelled."
          confirmLabel="Confirm"
          onConfirm={() => {
            setOpen(false);
            onConfirm();
          }}
          onCancel={() => setOpen(false)}
        />
      )}
    </>
  );
}

function openHarness(onConfirm?: () => void) {
  render(<Harness onConfirm={onConfirm} />);
  const trigger = screen.getByRole('button', { name: 'Open' });
  trigger.focus();
  fireEvent.click(trigger);
  return { trigger, dialog: screen.getByRole('dialog') };
}

describe('ConfirmDialog (UI-11)', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('is a labelled modal dialog and moves focus to Go back when it opens', () => {
    const { dialog } = openHarness();
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAccessibleName('Cancel this Action?');
    expect(dialog).toHaveClass('tt-confirm-dialog');
    // The safe choice holds focus first, so Enter straight after opening never confirms.
    expect(within(dialog).getByRole('button', { name: 'Go back' })).toHaveFocus();
  });

  it('keeps Tab and Shift+Tab inside the dialog', () => {
    const { dialog } = openHarness();
    const goBack = within(dialog).getByRole('button', { name: 'Go back' });
    const confirm = within(dialog).getByRole('button', { name: 'Confirm' });

    confirm.focus();
    fireEvent.keyDown(confirm, { key: 'Tab' });
    expect(goBack).toHaveFocus();

    fireEvent.keyDown(goBack, { key: 'Tab', shiftKey: true });
    expect(confirm).toHaveFocus();
  });

  it('closes on Escape without confirming and returns focus to what opened it', () => {
    const onConfirm = vi.fn();
    const { trigger, dialog } = openHarness(onConfirm);
    fireEvent.keyDown(within(dialog).getByRole('button', { name: 'Go back' }), { key: 'Escape' });

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(onConfirm).not.toHaveBeenCalled();
    expect(trigger).toHaveFocus();
  });
});

// The three screens, each checked through its real dialog.
const ok = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body }) as Response;
const ME: AuthUser = { id: 12, name: 'Pimchanok Rattana', email: 'pimchanok.rattana@toktickit.dev', role: 'IT_STAFF', mustChangePassword: false };

function mockApi(routes: Record<string, () => Response>, user: AuthUser) {
  return vi.spyOn(global, 'fetch').mockImplementation(
    withAuthMe(user, async (input, init) => {
      const url = new URL(String(input), 'http://localhost');
      const key = `${(init?.method ?? 'GET').toUpperCase()} ${url.pathname}`;
      const handler = routes[key];
      if (!handler) throw new Error(`Unexpected fetch: ${key}`);
      return handler();
    }),
  );
}

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

const pressEscape = (dialog: HTMLElement) => fireEvent.keyDown(within(dialog).getByRole('button', { name: /go back/i }), { key: 'Escape' });

describe('every confirm dialog closes on Escape and returns focus (UI-11)', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('Cancel Action on Staff Ticket Detail', async () => {
    const spy = mockApi(
      {
        'GET /api/tickets/42/actions': () =>
          ok([
            {
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
            },
          ]),
      },
      ME,
    );
    render(
      <ActionsTakenSection
        ticketId={42}
        editable
        ticketClosed={false}
        assignees={[{ id: 12, name: 'Pimchanok Rattana' }]}
        currentUser={{ id: 12, name: 'Pimchanok Rattana' }}
      />,
    );
    fireEvent.click(await screen.findByRole('button', { name: /open action/i }));
    const form = screen.getByRole('form', { name: /edit action/i });
    fireEvent.change(within(form).getByLabelText(/^status/i), { target: { value: 'CANCELLED' } });
    const save = within(form).getByRole('button', { name: /save changes/i });
    save.focus();
    fireEvent.click(save);

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('button', { name: /go back/i })).toHaveFocus();
    pressEscape(dialog);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(save).toHaveFocus();
    expect(spy.mock.calls.filter(([, init]) => init?.method === 'PATCH')).toHaveLength(0);
  });

  it('Cancel Ticket on Staff Ticket Detail', async () => {
    const spy = mockApi(
      {
        // Cancelled is a permitted move from Open, not from In Progress.
        'GET /api/staff/tickets/42': () => ok(ticket({ currentStatus: 'OPEN' })),
        'GET /api/staff/assignable-users': () => ok([{ id: 12, name: 'Pimchanok Rattana', role: 'IT_STAFF' }]),
        'GET /api/tickets/42/comments': () => ok([]),
        'GET /api/tickets/42/notes': () => ok([]),
        'GET /api/tickets/42/actions': () => ok([]),
        'GET /api/tickets/42/history': () => ok([]),
      },
      ME,
    );
    renderWithAuth(
      <Routes>
        <Route path="/staff/tickets/:id" element={<StaffTicketDetail />} />
      </Routes>,
      ['/staff/tickets/42'],
    );
    await screen.findByDisplayValue('TKT-2026-000042');
    fireEvent.change(screen.getByLabelText(/change status/i), { target: { value: 'CANCELLED' } });
    const update = screen.getByRole('button', { name: /update status/i });
    update.focus();
    fireEvent.click(update);

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveAccessibleName(/cancel this ticket/i);
    expect(within(dialog).getByRole('button', { name: /go back/i })).toHaveFocus();
    pressEscape(dialog);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(update).toHaveFocus();
    expect(spy.mock.calls.filter(([, init]) => init?.method === 'PATCH')).toHaveLength(0);
  });

  it('Problem Appears Resolved on Requester Ticket Detail', async () => {
    const spy = mockApi(
      {
        'GET /api/tickets/42': () => ok(ticket({ owner: undefined, itPriority: undefined, gate: undefined })),
        'GET /api/tickets/42/comments': () => ok([]),
        'GET /api/tickets/42/actions': () => ok([]),
        'GET /api/tickets/42/history': () => ok([]),
      },
      MOCK_REQUESTER,
    );
    renderWithAuth(
      <Routes>
        <Route path="/tickets/:id" element={<RequesterTicketDetail />} />
      </Routes>,
      ['/tickets/42'],
    );
    const signal = await screen.findByRole('button', { name: /problem appears resolved/i });
    signal.focus();
    fireEvent.click(signal);

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('button', { name: /go back/i })).toHaveFocus();
    pressEscape(dialog);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(signal).toHaveFocus();
    expect(spy.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(0);
  });
});
