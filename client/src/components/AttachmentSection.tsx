import { useState, type ChangeEvent } from 'react';
import { useRequester } from '../context/RequesterContext';

export interface Attachment {
  id: number;
  ticketId: number;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: string;
  isActive: boolean;
  removedAt: string | null;
  removalReason: string | null;
}

// BR-15, matching CreateTicket.tsx's own picker.
const ALLOWED_ATTACHMENT_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
const MAX_ATTACHMENT_COUNT = 5;

type UploadStatus = 'uploading' | 'success' | 'failed';

interface PendingUpload {
  key: string;
  file: File;
  error: string | null;
  uploadStatus: UploadStatus | null;
  uploadMessage: string | null;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function attachmentIcon(mimeType: string): string {
  return mimeType.startsWith('image/') ? '🖼️' : '📄';
}

interface AttachmentSectionProps {
  ticketId: number;
  attachments: Attachment[];
  onAttachmentAdded: (attachment: Attachment) => void;
  onAttachmentRemoved: (attachment: Attachment) => void;
}

// ui-spec.md 14/15: the Attachment section on Ticket Detail - add and soft-remove, behind its
// own heading and divider so it never visually merges with the read-only Ticket fields above it.
export function AttachmentSection({
  ticketId,
  attachments,
  onAttachmentAdded,
  onAttachmentRemoved,
}: AttachmentSectionProps) {
  const { requester } = useRequester();

  const [pendingUploads, setPendingUploads] = useState<PendingUpload[]>([]);
  const [removingId, setRemovingId] = useState<number | null>(null);
  const [removeReason, setRemoveReason] = useState('');
  const [removeSubmitting, setRemoveSubmitting] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);

  const activeCount = attachments.filter((a) => a.isActive).length;

  const uploadFile = async (key: string, file: File) => {
    setPendingUploads((prev) =>
      prev.map((row) => (row.key === key ? { ...row, uploadStatus: 'uploading', uploadMessage: null } : row)),
    );

    try {
      const body = new FormData();
      body.append('file', file);

      const response = await fetch(`/api/tickets/${ticketId}/attachments`, {
        method: 'POST',
        headers: { 'X-Requester-Id': String(requester!.id) },
        body,
        signal: AbortSignal.timeout(20000),
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => null);
        setPendingUploads((prev) =>
          prev.map((row) =>
            row.key === key
              ? { ...row, uploadStatus: 'failed', uploadMessage: errorBody?.error?.message ?? 'Upload failed.' }
              : row,
          ),
        );
        return;
      }

      const created = (await response.json()) as Attachment;
      onAttachmentAdded(created);
      // AC-22: once active, the row belongs to the attachments list above, not this queue.
      setPendingUploads((prev) => prev.filter((row) => row.key !== key));
    } catch {
      setPendingUploads((prev) =>
        prev.map((row) =>
          row.key === key
            ? { ...row, uploadStatus: 'failed', uploadMessage: 'Unable to reach the server.' }
            : row,
        ),
      );
    }
  };

  const handleFilesSelected = (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files) return;

    let validCount = activeCount + pendingUploads.filter((row) => row.error === null).length;
    const nextRows: PendingUpload[] = Array.from(files).map((file, index) => {
      const key = `${file.name}-${Date.now()}-${index}`;
      if (!ALLOWED_ATTACHMENT_TYPES.includes(file.type)) {
        return { key, file, error: 'File type not allowed. Use JPG, PNG, WEBP, or PDF.', uploadStatus: null, uploadMessage: null };
      }
      if (file.size > MAX_ATTACHMENT_BYTES) {
        return { key, file, error: 'File is over the 5 MB limit.', uploadStatus: null, uploadMessage: null };
      }
      if (validCount >= MAX_ATTACHMENT_COUNT) {
        return { key, file, error: 'Only 5 attachments are allowed per Ticket (BR-15).', uploadStatus: null, uploadMessage: null };
      }
      validCount += 1;
      return { key, file, error: null, uploadStatus: null, uploadMessage: null };
    });

    setPendingUploads((prev) => [...prev, ...nextRows]);
    event.target.value = '';

    for (const row of nextRows) {
      if (row.error === null) void uploadFile(row.key, row.file);
    }
  };

  const handleRetry = (key: string) => {
    const row = pendingUploads.find((r) => r.key === key);
    if (row) void uploadFile(key, row.file);
  };

  const dismissInvalid = (key: string) => {
    setPendingUploads((prev) => prev.filter((row) => row.key !== key));
  };

  // BR-17: removal requires confirmation and a reason - clicking Remove opens this inline
  // prompt rather than removing immediately.
  const startRemoving = (attachmentId: number) => {
    setRemovingId(attachmentId);
    setRemoveReason('');
    setRemoveError(null);
  };

  const cancelRemoving = () => {
    setRemovingId(null);
    setRemoveReason('');
    setRemoveError(null);
  };

  const confirmRemoving = async (attachmentId: number) => {
    if (!removeReason.trim()) {
      setRemoveError('A reason is required to remove an attachment.');
      return;
    }

    setRemoveSubmitting(true);
    setRemoveError(null);
    try {
      const response = await fetch(`/api/attachments/${attachmentId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', 'X-Requester-Id': String(requester!.id) },
        body: JSON.stringify({ reason: removeReason.trim() }),
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => null);
        setRemoveError(errorBody?.error?.message ?? 'Unable to remove this attachment right now.');
        return;
      }

      const updated = (await response.json()) as Attachment;
      onAttachmentRemoved(updated);
      setRemovingId(null);
      setRemoveReason('');
    } catch {
      setRemoveError('Unable to reach the server. Please try again.');
    } finally {
      setRemoveSubmitting(false);
    }
  };

  return (
    <section className="tt-attachment-section">
      <hr className="tt-attachment-divider" />
      <h2 className="h5 mb-3">Attachments</h2>

      {attachments.length === 0 && pendingUploads.length === 0 && (
        <p className="text-muted">No attachments.</p>
      )}

      {(attachments.length > 0 || pendingUploads.length > 0) && (
        <ul className="list-unstyled tt-attachment-list">
          {attachments.map((attachment) => (
            <li key={attachment.id} className="tt-attachment-row mb-2">
              {attachment.isActive ? (
                <>
                  <div className="d-flex align-items-center gap-2 flex-wrap">
                    <span aria-hidden="true">{attachmentIcon(attachment.mimeType)}</span>
                    <span>{attachment.originalFilename}</span>
                    <span className="text-muted">({formatBytes(attachment.sizeBytes)})</span>
                    <a
                      href={`/api/attachments/${attachment.id}/download?requesterId=${requester?.id}`}
                      className="btn btn-tt-tertiary btn-sm"
                    >
                      Download
                    </a>
                    {removingId !== attachment.id && (
                      <button
                        type="button"
                        className="btn btn-tt-destructive btn-sm"
                        onClick={() => startRemoving(attachment.id)}
                      >
                        Remove
                      </button>
                    )}
                  </div>

                  {/* BR-17: confirmation and a reason, inline rather than a silent delete. */}
                  {removingId === attachment.id && (
                    <div className="tt-attachment-remove-confirm mt-2 p-2">
                      <label htmlFor={`remove-reason-${attachment.id}`} className="form-label">
                        Reason for removal
                      </label>
                      <input
                        id={`remove-reason-${attachment.id}`}
                        type="text"
                        className="form-control form-control-sm mb-2"
                        value={removeReason}
                        onChange={(event) => setRemoveReason(event.target.value)}
                        placeholder="e.g. Wrong file attached by mistake"
                      />
                      {removeError && <div className="tt-inline-error mb-2">{removeError}</div>}
                      <button
                        type="button"
                        className="btn btn-tt-destructive btn-sm me-2"
                        disabled={removeSubmitting}
                        onClick={() => confirmRemoving(attachment.id)}
                      >
                        {removeSubmitting ? 'Removing…' : 'Confirm Remove'}
                      </button>
                      <button
                        type="button"
                        className="btn btn-tt-tertiary btn-sm"
                        disabled={removeSubmitting}
                        onClick={cancelRemoving}
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </>
              ) : (
                // ui-spec.md 15: Removed - grayed out, no Download link, no preview.
                <span className="text-muted">
                  {attachment.originalFilename} — Removed
                  {attachment.removalReason ? ` — ${attachment.removalReason}` : ''}
                </span>
              )}
            </li>
          ))}

          {pendingUploads.map((row) => (
            <li key={row.key} className="tt-attachment-row mb-2 d-flex align-items-center gap-2">
              <span className="badge text-bg-secondary">{row.file.name}</span>
              {row.error && (
                <>
                  {/* ui-spec.md 15: Invalid - dismissible inline rejection, never uploaded. */}
                  <span className="tt-inline-error">{row.error}</span>
                  <button
                    type="button"
                    className="btn btn-tt-tertiary btn-sm"
                    onClick={() => dismissInvalid(row.key)}
                  >
                    Dismiss
                  </button>
                </>
              )}
              {row.uploadStatus === 'uploading' && (
                <span className="text-muted" aria-busy="true">
                  <span className="spinner-border spinner-border-sm me-1" aria-hidden="true"></span>
                  Uploading…
                </span>
              )}
              {row.uploadStatus === 'failed' && (
                <>
                  <span className="tt-inline-error">{row.uploadMessage ?? 'Upload failed.'}</span>
                  <button type="button" className="btn btn-tt-tertiary btn-sm" onClick={() => handleRetry(row.key)}>
                    Retry
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3">
        <label htmlFor="add-attachment" className="form-label">
          Add attachment
        </label>
        <input
          id="add-attachment"
          type="file"
          className="form-control"
          multiple
          accept=".jpg,.jpeg,.png,.webp,.pdf"
          onChange={handleFilesSelected}
          disabled={activeCount >= MAX_ATTACHMENT_COUNT}
        />
        {activeCount >= MAX_ATTACHMENT_COUNT && (
          <div className="form-text">This Ticket already has 5 active attachments (BR-15).</div>
        )}
      </div>
    </section>
  );
}
