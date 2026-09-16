import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, waitFor, cleanup, fireEvent } from '@testing-library/react';
import { CreateTicket } from '../../src/pages/CreateTicket';
import { renderWithAuth, withAuthMe, MOCK_REQUESTER } from '../support/auth-mock';

function mockReferenceDataFetch() {
  return vi.spyOn(global, 'fetch').mockImplementation(
    withAuthMe(MOCK_REQUESTER, async (input) => {
      const url = String(input);
      if (url.includes('/api/categories')) {
        return { ok: true, json: async () => [{ id: 1, name: 'Hardware' }] } as Response;
      }
      if (url.includes('/api/related-systems')) {
        return { ok: true, json: async () => [{ id: 1, name: 'Campus Wi-Fi' }] } as Response;
      }
      throw new Error(`Unexpected fetch: ${url}`);
    }),
  );
}

function fillValidForm() {
  fireEvent.change(screen.getByLabelText(/category/i), { target: { value: '1' } });
  fireEvent.change(screen.getByLabelText(/related system/i), { target: { value: '1' } });
  fireEvent.change(screen.getByLabelText(/summary/i), {
    target: { value: 'Laptop battery drains quickly' },
  });
  fireEvent.change(screen.getByLabelText(/description/i), {
    target: { value: 'Battery drops from 100% to 20% within two hours of normal use.' },
  });
  fireEvent.change(screen.getByLabelText(/requested priority/i), { target: { value: 'MEDIUM' } });
}

function renderCreateTicket() {
  return renderWithAuth(<CreateTicket />);
}

describe('CreateTicket', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('shows a loading placeholder on the dropdowns while reference data loads', () => {
    vi.spyOn(global, 'fetch').mockImplementation(withAuthMe(MOCK_REQUESTER, () => new Promise(() => {})));

    renderCreateTicket();

    expect(screen.getAllByText(/loading…/i).length).toBeGreaterThan(0);
    expect(screen.getByLabelText(/category/i)).toBeDisabled();
  });

  it('shows a safe error when reference data fails to load', async () => {
    vi.spyOn(global, 'fetch').mockImplementation(
      withAuthMe(MOCK_REQUESTER, () => Promise.reject(new Error('network down'))),
    );

    renderCreateTicket();

    await waitFor(() => {
      expect(screen.getByText(/unable to load categories or related systems/i)).toBeInTheDocument();
    });
  });

  it('shows field-level validation messages on submit and makes no ticket-creation call', async () => {
    const fetchSpy = mockReferenceDataFetch();

    renderCreateTicket();
    await waitFor(() => expect(screen.getByLabelText(/category/i)).toBeEnabled());

    fireEvent.click(screen.getByRole('button', { name: /^submit$/i }));

    expect(await screen.findByText(/category is required/i)).toBeInTheDocument();
    expect(screen.getByText(/summary must be 5-120 characters/i)).toBeInTheDocument();

    // /auth/me plus the two reference-data GETs on mount — validation blocked the POST.
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it('shows Submit in a busy, disabled state while the request is in flight', async () => {
    mockReferenceDataFetch();

    renderCreateTicket();
    await waitFor(() => expect(screen.getByLabelText(/category/i)).toBeEnabled());
    fillValidForm();

    const ticketFetch = vi.spyOn(global, 'fetch').mockImplementation(
      withAuthMe(MOCK_REQUESTER, (input) => {
        const url = String(input);
        if (url.includes('/api/tickets')) {
          return new Promise(() => {}); // never resolves — holds the busy state on screen
        }
        return Promise.reject(new Error(`Unexpected fetch: ${url}`));
      }),
    );

    fireEvent.click(screen.getByRole('button', { name: /^submit$/i }));

    const busyButton = await screen.findByRole('button', { name: /submitting/i });
    expect(busyButton).toBeDisabled();

    // BR-13: clicking again while the request is in flight must not fire a second create call.
    fireEvent.click(busyButton);
    const createCalls = ticketFetch.mock.calls.filter(([input]) =>
      String(input).includes('/api/tickets'),
    );
    expect(createCalls).toHaveLength(1);
  });

  it('shows a safe error and keeps entered values when the backend is unreachable', async () => {
    mockReferenceDataFetch();

    renderCreateTicket();
    await waitFor(() => expect(screen.getByLabelText(/category/i)).toBeEnabled());
    fillValidForm();

    vi.spyOn(global, 'fetch').mockImplementation(
      withAuthMe(MOCK_REQUESTER, (input) => {
        const url = String(input);
        if (url.includes('/api/tickets')) {
          return Promise.reject(new Error('backend down'));
        }
        return Promise.reject(new Error(`Unexpected fetch: ${url}`));
      }),
    );

    fireEvent.click(screen.getByRole('button', { name: /^submit$/i }));

    await waitFor(() => {
      expect(screen.getByText(/unable to reach the server/i)).toBeInTheDocument();
    });

    expect(screen.getByLabelText(/summary/i)).toHaveValue('Laptop battery drains quickly');
  });

  it('shows the backend-generated Ticket Number on success', async () => {
    mockReferenceDataFetch();

    renderCreateTicket();
    await waitFor(() => expect(screen.getByLabelText(/category/i)).toBeEnabled());

    // AC-27: the Requester shown during entry is the authenticated user, read-only.
    const requesterField = screen.getByLabelText(/^requester$/i);
    expect(requesterField).toHaveValue('Anong Srisai');
    expect(requesterField).toHaveAttribute('readOnly');

    fillValidForm();

    vi.spyOn(global, 'fetch').mockImplementation(
      withAuthMe(MOCK_REQUESTER, (input) => {
        const url = String(input);
        if (url.includes('/api/tickets')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ ticketNumber: 'TKT-2026-000001' }),
          } as Response);
        }
        return Promise.reject(new Error(`Unexpected fetch: ${url}`));
      }),
    );

    fireEvent.click(screen.getByRole('button', { name: /^submit$/i }));

    expect(await screen.findByText(/TKT-2026-000001/)).toBeInTheDocument();
  });

  it('rejects an oversized attachment with an inline message', async () => {
    mockReferenceDataFetch();

    renderCreateTicket();
    await waitFor(() => expect(screen.getByLabelText(/category/i)).toBeEnabled());

    const bigFile = new File([new Uint8Array(6 * 1024 * 1024)], 'photo.png', { type: 'image/png' });
    fireEvent.change(screen.getByLabelText(/attachments/i), { target: { files: [bigFile] } });

    expect(await screen.findByText(/over the 5 mb limit/i)).toBeInTheDocument();
  });

  it('rejects a disallowed file type with an inline message', async () => {
    mockReferenceDataFetch();

    renderCreateTicket();
    await waitFor(() => expect(screen.getByLabelText(/category/i)).toBeEnabled());

    const badFile = new File(['hello'], 'notes.txt', { type: 'text/plain' });
    fireEvent.change(screen.getByLabelText(/attachments/i), { target: { files: [badFile] } });

    expect(await screen.findByText(/file type not allowed/i)).toBeInTheDocument();
  });

  it('maps a 400 error.fields response onto the matching form fields (AC-09, AC-10)', async () => {
    mockReferenceDataFetch();

    renderCreateTicket();
    await waitFor(() => expect(screen.getByLabelText(/category/i)).toBeEnabled());
    fillValidForm();

    vi.restoreAllMocks();
    vi.spyOn(global, 'fetch').mockImplementation(
      withAuthMe(MOCK_REQUESTER, (input) => {
        const url = String(input);
        if (url.includes('/api/tickets')) {
          return Promise.resolve({
            ok: false,
            status: 400,
            json: async () => ({
              error: {
                code: 'VALIDATION_ERROR',
                message: 'One or more fields are invalid',
                fields: [
                  { field: 'categoryId', message: 'categoryId must reference an active category' },
                ],
              },
            }),
          } as Response);
        }
        return Promise.reject(new Error(`Unexpected fetch: ${url}`));
      }),
    );

    fireEvent.click(screen.getByRole('button', { name: /^submit$/i }));

    // The server's own field message is shown, not the generic network banner.
    expect(
      await screen.findByText(/categoryid must reference an active category/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/unable to reach the server/i)).not.toBeInTheDocument();
  });

  it('shows the server message when a rejection has no matching field', async () => {
    mockReferenceDataFetch();

    renderCreateTicket();
    await waitFor(() => expect(screen.getByLabelText(/category/i)).toBeEnabled());
    fillValidForm();

    vi.restoreAllMocks();
    vi.spyOn(global, 'fetch').mockImplementation(
      withAuthMe(MOCK_REQUESTER, (input) => {
        const url = String(input);
        if (url.includes('/api/tickets')) {
          return Promise.resolve({
            ok: false,
            status: 500,
            json: async () => ({
              error: { code: 'INTERNAL_ERROR', message: 'Unable to create ticket' },
            }),
          } as Response);
        }
        return Promise.reject(new Error(`Unexpected fetch: ${url}`));
      }),
    );

    fireEvent.click(screen.getByRole('button', { name: /^submit$/i }));

    expect(await screen.findByText(/unable to create ticket/i)).toBeInTheDocument();
  });

  it('rejects a sixth attachment once five valid files are selected (BR-15)', async () => {
    mockReferenceDataFetch();

    renderCreateTicket();
    await waitFor(() => expect(screen.getByLabelText(/category/i)).toBeEnabled());

    const files = Array.from({ length: 6 }, (_, i) =>
      new File(['x'], `shot-${i}.png`, { type: 'image/png' }),
    );
    fireEvent.change(screen.getByLabelText(/attachments/i), { target: { files } });

    expect(await screen.findByText(/only 5 attachments are allowed/i)).toBeInTheDocument();
  });

  // API-17/BR-19: the Ticket is kept even if an attachment upload afterward fails, and the
  // Requester is shown which one failed with a way to retry it.
  it('uploads a selected attachment once the Ticket is created', async () => {
    mockReferenceDataFetch();

    renderCreateTicket();
    await waitFor(() => expect(screen.getByLabelText(/category/i)).toBeEnabled());
    fillValidForm();

    const goodFile = new File(['x'], 'screenshot.png', { type: 'image/png' });
    fireEvent.change(screen.getByLabelText(/attachments/i), { target: { files: [goodFile] } });

    const fetchSpy = vi.spyOn(global, 'fetch').mockImplementation(
      withAuthMe(MOCK_REQUESTER, (input) => {
        const url = String(input);
        if (url.endsWith('/api/tickets')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ id: 42, ticketNumber: 'TKT-2026-000042' }),
          } as Response);
        }
        if (url.includes('/attachments')) {
          return Promise.resolve({ ok: true, json: async () => ({ id: 1, isActive: true }) } as Response);
        }
        return Promise.reject(new Error(`Unexpected fetch: ${url}`));
      }),
    );

    fireEvent.click(screen.getByRole('button', { name: /^submit$/i }));

    expect(await screen.findByText(/TKT-2026-000042/)).toBeInTheDocument();
    expect(await screen.findByText(/^uploaded$/i)).toBeInTheDocument();

    const uploadCall = fetchSpy.mock.calls.find(([input]) => String(input).includes('/attachments'));
    expect(uploadCall?.[0]).toBe('/api/tickets/42/attachments');
    expect((uploadCall?.[1] as RequestInit).credentials).toBe('include');
  });

  it('keeps the Ticket and offers a Retry when the attachment upload fails (BR-19)', async () => {
    mockReferenceDataFetch();

    renderCreateTicket();
    await waitFor(() => expect(screen.getByLabelText(/category/i)).toBeEnabled());
    fillValidForm();

    const goodFile = new File(['x'], 'screenshot.png', { type: 'image/png' });
    fireEvent.change(screen.getByLabelText(/attachments/i), { target: { files: [goodFile] } });

    let uploadAttempts = 0;
    vi.spyOn(global, 'fetch').mockImplementation(
      withAuthMe(MOCK_REQUESTER, (input) => {
        const url = String(input);
        if (url.endsWith('/api/tickets')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ id: 42, ticketNumber: 'TKT-2026-000042' }),
          } as Response);
        }
        if (url.includes('/attachments')) {
          uploadAttempts += 1;
          if (uploadAttempts === 1) {
            return Promise.resolve({
              ok: false,
              status: 500,
              json: async () => ({ error: { code: 'INTERNAL_ERROR', message: 'Unable to upload attachment' } }),
            } as Response);
          }
          return Promise.resolve({ ok: true, json: async () => ({ id: 1, isActive: true }) } as Response);
        }
        return Promise.reject(new Error(`Unexpected fetch: ${url}`));
      }),
    );

    fireEvent.click(screen.getByRole('button', { name: /^submit$/i }));

    // The Ticket is shown as created regardless of the attachment outcome.
    expect(await screen.findByText(/TKT-2026-000042/)).toBeInTheDocument();
    expect(await screen.findByText(/unable to upload attachment/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /retry/i }));

    expect(await screen.findByText(/^uploaded$/i)).toBeInTheDocument();
    expect(uploadAttempts).toBe(2);
  });
});
