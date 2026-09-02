import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { RequesterProvider } from '../../src/context/RequesterContext';
import { AttachmentSection, type Attachment } from '../../src/components/AttachmentSection';

const STORAGE_KEY = 'toktickit.selectedRequester';

function selectStoredRequester(id = 1) {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ id, name: 'Anong Srisai' }));
}

const attachment = (over: Partial<Attachment> = {}): Attachment => ({
  id: 7,
  ticketId: 42,
  originalFilename: 'screenshot.png',
  mimeType: 'image/png',
  sizeBytes: 2048,
  uploadedAt: '2026-08-30T03:20:00.000Z',
  isActive: true,
  removedAt: null,
  removalReason: null,
  ...over,
});

function renderSection(attachments: Attachment[], overrides: Partial<Parameters<typeof AttachmentSection>[0]> = {}) {
  const onAttachmentAdded = vi.fn();
  const onAttachmentRemoved = vi.fn();
  const utils = render(
    <RequesterProvider>
      <AttachmentSection
        ticketId={42}
        attachments={attachments}
        onAttachmentAdded={onAttachmentAdded}
        onAttachmentRemoved={onAttachmentRemoved}
        {...overrides}
      />
    </RequesterProvider>,
  );
  return { ...utils, onAttachmentAdded, onAttachmentRemoved };
}

describe('AttachmentSection', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    sessionStorage.clear();
  });

  it('shows "No attachments." when there are none', () => {
    selectStoredRequester();
    renderSection([]);

    expect(screen.getByText(/no attachments/i)).toBeInTheDocument();
  });

  // UI-14 - AC-22: adding a new attachment
  it('uploads a valid selected file and reports it via onAttachmentAdded', async () => {
    selectStoredRequester();
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => attachment({ id: 9, originalFilename: 'new-file.png' }),
    } as Response);

    const { onAttachmentAdded } = renderSection([]);

    const file = new File(['x'], 'new-file.png', { type: 'image/png' });
    fireEvent.change(screen.getByLabelText(/add attachment/i), { target: { files: [file] } });

    await waitFor(() => expect(onAttachmentAdded).toHaveBeenCalledWith(expect.objectContaining({ id: 9 })));

    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('/api/tickets/42/attachments');
    expect((init as RequestInit).headers).toMatchObject({ 'X-Requester-Id': '1' });
  });

  it('rejects a disallowed file type inline, without uploading it', async () => {
    selectStoredRequester();
    const fetchSpy = vi.spyOn(global, 'fetch');

    renderSection([]);

    const file = new File(['x'], 'notes.txt', { type: 'text/plain' });
    fireEvent.change(screen.getByLabelText(/add attachment/i), { target: { files: [file] } });

    expect(await screen.findByText(/file type not allowed/i)).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('shows a Retry action when an upload fails', async () => {
    selectStoredRequester();
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      json: async () => ({ error: { code: 'INTERNAL_ERROR', message: 'Upload failed.' } }),
    } as Response);

    renderSection([]);

    const file = new File(['x'], 'photo.png', { type: 'image/png' });
    fireEvent.change(screen.getByLabelText(/add attachment/i), { target: { files: [file] } });

    expect(await screen.findByRole('button', { name: /retry/i })).toBeInTheDocument();
  });

  // UI-15 - AC-24: a removed attachment has no download control
  it('shows no Download or Remove control for a removed attachment', () => {
    selectStoredRequester();
    renderSection([attachment({ isActive: false, removedAt: '2026-08-31T00:00:00.000Z', removalReason: 'Wrong file' })]);

    expect(screen.getByText(/removed/i)).toBeInTheDocument();
    expect(screen.getByText(/wrong file/i)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /download/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^remove$/i })).not.toBeInTheDocument();
  });

  // UI-14 - AC-23, BR-17: soft removal requires confirmation and a reason
  it('requires a reason before confirming removal, then reports it via onAttachmentRemoved', async () => {
    selectStoredRequester();
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => attachment({ isActive: false, removalReason: 'Wrong file attached' }),
    } as Response);

    const { onAttachmentRemoved } = renderSection([attachment()]);

    fireEvent.click(screen.getByRole('button', { name: /^remove$/i }));
    fireEvent.click(screen.getByRole('button', { name: /confirm remove/i }));

    // No reason entered yet - rejected client-side, no request sent.
    expect(await screen.findByText(/reason is required/i)).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText(/reason for removal/i), {
      target: { value: 'Wrong file attached' },
    });
    fireEvent.click(screen.getByRole('button', { name: /confirm remove/i }));

    await waitFor(() => expect(onAttachmentRemoved).toHaveBeenCalled());
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('/api/attachments/7');
    expect((init as RequestInit).method).toBe('DELETE');
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ reason: 'Wrong file attached' });
  });

  it('disables the add-attachment picker once 5 attachments are active (BR-15)', () => {
    selectStoredRequester();
    const fiveActive = Array.from({ length: 5 }, (_, i) => attachment({ id: i + 1 }));

    renderSection(fiveActive);

    expect(screen.getByLabelText(/add attachment/i)).toBeDisabled();
    expect(screen.getByText(/already has 5 active attachments/i)).toBeInTheDocument();
  });
});
