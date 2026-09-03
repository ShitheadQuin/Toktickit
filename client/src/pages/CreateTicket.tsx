import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import { useRequester } from '../context/RequesterContext';

interface ReferenceItem {
  id: number;
  name: string;
}

type ReferenceState = 'loading' | 'loaded' | 'error';

const REQUESTED_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH'] as const;
type RequestedPriority = (typeof REQUESTED_PRIORITIES)[number];

const ALLOWED_ATTACHMENT_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
const MAX_ATTACHMENT_COUNT = 5;

// ui-spec.md 7/15: an accepted file moves through uploading, then either active or invalid
// (rejected here, before submit, so it never reaches the server). 'pending' is the initial
// state before the Ticket exists to upload to.
type UploadStatus = 'pending' | 'uploading' | 'success' | 'failed';

interface AttachmentRow {
  file: File;
  error: string | null;
  uploadStatus: UploadStatus;
  uploadMessage: string | null;
}

interface FormValues {
  categoryId: string;
  relatedSystemId: string;
  summary: string;
  description: string;
  requestedPriority: RequestedPriority | '';
}

type FieldName = keyof FormValues;

type FieldErrors = Partial<Record<FieldName, string>>;

const initialValues: FormValues = {
  categoryId: '',
  relatedSystemId: '',
  summary: '',
  description: '',
  requestedPriority: '',
};

function validate(values: FormValues): FieldErrors {
  const errors: FieldErrors = {};

  if (!values.categoryId) {
    errors.categoryId = 'Category is required.';
  }
  if (!values.relatedSystemId) {
    errors.relatedSystemId = 'Related System is required.';
  }

  const summary = values.summary.trim();
  if (summary.length < 5 || summary.length > 120) {
    errors.summary = 'Summary must be 5-120 characters.';
  }

  const description = values.description.trim();
  if (description.length < 10 || description.length > 2000) {
    errors.description = 'Description must be 10-2000 characters.';
  }

  if (!values.requestedPriority) {
    errors.requestedPriority = 'Requested Priority is required.';
  }

  return errors;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileTypeLabel(file: File): string {
  const ext = file.name.split('.').pop()?.toUpperCase();
  return ext ?? 'FILE';
}

export function CreateTicket() {
  const { requester } = useRequester();

  const [categories, setCategories] = useState<ReferenceItem[]>([]);
  const [relatedSystems, setRelatedSystems] = useState<ReferenceItem[]>([]);
  const [referenceState, setReferenceState] = useState<ReferenceState>('loading');

  const [values, setValues] = useState<FormValues>(initialValues);
  const [touched, setTouched] = useState<Partial<Record<FieldName, boolean>>>({});
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [successTicketNumber, setSuccessTicketNumber] = useState<string | null>(null);
  const [successTicketId, setSuccessTicketId] = useState<number | null>(null);

  const [serverFieldErrors, setServerFieldErrors] = useState<FieldErrors>({});

  const [attachments, setAttachments] = useState<AttachmentRow[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function loadReferenceData() {
      setReferenceState('loading');
      try {
        const [categoriesResponse, relatedSystemsResponse] = await Promise.all([
          fetch('/api/categories', { signal: AbortSignal.timeout(5000) }),
          fetch('/api/related-systems', { signal: AbortSignal.timeout(5000) }),
        ]);
        if (!categoriesResponse.ok || !relatedSystemsResponse.ok) {
          throw new Error('Backend returned an error');
        }
        const categoriesData: ReferenceItem[] = await categoriesResponse.json();
        const relatedSystemsData: ReferenceItem[] = await relatedSystemsResponse.json();
        if (cancelled) return;
        setCategories(categoriesData);
        setRelatedSystems(relatedSystemsData);
        setReferenceState('loaded');
      } catch {
        if (!cancelled) {
          setReferenceState('error');
        }
      }
    }

    loadReferenceData();
    return () => {
      cancelled = true;
    };
  }, []);

  // Server errors are spread last: the backend is the authority, and it knows things the
  // client cannot, such as a Category deactivated after this page loaded (api-spec.md 1).
  const errors: FieldErrors = { ...validate(values), ...serverFieldErrors };

  const showError = (field: FieldName) => Boolean((touched[field] || submitAttempted) && errors[field]);

  const handleChange =
    (field: FieldName) =>
    (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      setValues((prev) => ({ ...prev, [field]: event.target.value }));
      // Drop this field's server-side rejection once the user edits it; a stale message on a
      // field they have already corrected is worse than none.
      setServerFieldErrors((prev) => {
        if (!(field in prev)) return prev;
        const next = { ...prev };
        delete next[field];
        return next;
      });
    };

  const handleBlur = (field: FieldName) => () => {
    setTouched((prev) => ({ ...prev, [field]: true }));
  };

  const handleFilesSelected = (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files) return;

    // Checks run in BR-27's order - type, then size, then the per-Ticket count - so the picker
    // and the server reject a file for the same reason in the same priority.
    let validCount = attachments.filter((row) => row.error === null).length;
    const nextRows: AttachmentRow[] = Array.from(files).map((file) => {
      if (!ALLOWED_ATTACHMENT_TYPES.includes(file.type)) {
        return { file, error: 'File type not allowed. Use JPG, PNG, WEBP, or PDF.', uploadStatus: 'pending', uploadMessage: null };
      }
      if (file.size > MAX_ATTACHMENT_BYTES) {
        return { file, error: 'File is over the 5 MB limit.', uploadStatus: 'pending', uploadMessage: null };
      }
      if (validCount >= MAX_ATTACHMENT_COUNT) {
        return { file, error: 'Only 5 attachments are allowed per Ticket (BR-15).', uploadStatus: 'pending', uploadMessage: null };
      }
      validCount += 1;
      return { file, error: null, uploadStatus: 'pending', uploadMessage: null };
    });

    setAttachments((prev) => [...prev, ...nextRows]);
    event.target.value = '';
  };

  const removeAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  // BR-19: the Ticket is already saved by the time this runs; a failed upload here never
  // rolls it back. Each row's own status is what carries success/failure, not the form.
  const uploadOneAttachment = async (ticketId: number, index: number) => {
    setAttachments((prev) =>
      prev.map((row, i) => (i === index ? { ...row, uploadStatus: 'uploading', uploadMessage: null } : row)),
    );

    try {
      const body = new FormData();
      body.append('file', attachments[index].file);

      const response = await fetch(`/api/tickets/${ticketId}/attachments`, {
        method: 'POST',
        headers: { 'X-Requester-Id': String(requester!.id) },
        body,
        signal: AbortSignal.timeout(20000),
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => null);
        setAttachments((prev) =>
          prev.map((row, i) =>
            i === index
              ? {
                  ...row,
                  uploadStatus: 'failed',
                  uploadMessage: errorBody?.error?.message ?? 'Upload failed. You can retry below.',
                }
              : row,
          ),
        );
        return;
      }

      setAttachments((prev) =>
        prev.map((row, i) => (i === index ? { ...row, uploadStatus: 'success', uploadMessage: null } : row)),
      );
    } catch {
      setAttachments((prev) =>
        prev.map((row, i) =>
          i === index
            ? { ...row, uploadStatus: 'failed', uploadMessage: 'Unable to reach the server. You can retry below.' }
            : row,
        ),
      );
    }
  };

  const uploadAllAttachments = async (ticketId: number) => {
    // Sequential, not Promise.all: keeps upload order predictable and avoids five concurrent
    // multipart requests competing for the same 5 MB-per-file backstop.
    for (let index = 0; index < attachments.length; index += 1) {
      if (attachments[index].error === null) {
        await uploadOneAttachment(ticketId, index);
      }
    }
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitAttempted(true);
    setSubmitError(null);
    setServerFieldErrors({});

    if (Object.keys(errors).length > 0) {
      return;
    }
    if (!requester || submitting) {
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch('/api/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requesterId: requester.id,
          categoryId: Number(values.categoryId),
          relatedSystemId: Number(values.relatedSystemId),
          summary: values.summary.trim(),
          description: values.description.trim(),
          requestedPriority: values.requestedPriority,
        }),
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        // A 500 can return HTML rather than JSON; without this guard the parse would throw and
        // land in the catch below, reporting a network failure for a server-side rejection.
        const body = await response.json().catch(() => null);
        const fields = body?.error?.fields;

        // Only VALIDATION_ERROR carries `fields` (api-spec.md 1). Map them onto the form so the
        // user sees which fields to fix, rather than a generic banner (AC-09, AC-10).
        if (response.status === 400 && Array.isArray(fields) && fields.length > 0) {
          setServerFieldErrors(
            Object.fromEntries(
              fields
                .filter((item: { field?: string; message?: string }) => item.field && item.message)
                .map((item: { field: string; message: string }) => [item.field, item.message]),
            ) as FieldErrors,
          );
          setSubmitError('The server rejected some fields. Please correct them and submit again.');
          return;
        }

        // No field to attach it to - e.g. 404 REQUESTER_NOT_FOUND when the selected Requester was
        // deactivated after selection. Show the server's own message so the cause is visible.
        setSubmitError(
          body?.error?.message ??
            'The server rejected the request. Your entered values have been kept - please try again.',
        );
        return;
      }

      const created = await response.json();
      setSuccessTicketNumber(created.ticketNumber);
      setSuccessTicketId(created.id);
      // BR-19: attachment upload happens after the Ticket is already saved, and its outcome
      // never affects the Ticket itself - only each row's own status, rendered below.
      void uploadAllAttachments(created.id);
    } catch {
      // Deliberately does not touch `values` — AC-12 requires every entered field to
      // still be there after a failed submission, not just a friendly message.
      setSubmitError('Unable to reach the server. Your entered values have been kept — please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateAnother = () => {
    setSuccessTicketNumber(null);
    setSuccessTicketId(null);
    setValues(initialValues);
    setTouched({});
    setSubmitAttempted(false);
    setAttachments([]);
  };

  const handleRetryUpload = (index: number) => {
    if (successTicketId === null) return;
    void uploadOneAttachment(successTicketId, index);
  };

  if (successTicketNumber) {
    return (
      <div className="create-ticket">
        <div className="alert alert-success" role="alert">
          <p className="mb-1">Ticket created successfully.</p>
          <p className="mb-0">
            <strong>Ticket Number:</strong> {successTicketNumber}
          </p>
        </div>

        {/* ui-spec.md 7/15: each file's own state (uploading/active/failed), not the form's -
            BR-19 means the Ticket above is already saved regardless of what happens here. */}
        {attachments.filter((row) => row.error === null).length > 0 && (
          <ul className="list-unstyled mb-3 tt-attachment-list">
            {attachments
              .map((row, index) => ({ row, index }))
              .filter(({ row }) => row.error === null)
              .map(({ row, index }) => (
                <li key={`${row.file.name}-${index}`} className="d-flex align-items-center gap-2 py-1">
                  <span className="badge text-bg-secondary">{fileTypeLabel(row.file)}</span>
                  <span>{row.file.name}</span>
                  {row.uploadStatus === 'uploading' && (
                    <span className="text-muted" aria-busy="true">
                      <span className="spinner-border spinner-border-sm me-1" aria-hidden="true"></span>
                      Uploading…
                    </span>
                  )}
                  {row.uploadStatus === 'success' && <span className="text-success">Uploaded</span>}
                  {row.uploadStatus === 'failed' && (
                    <>
                      <span className="tt-inline-error">{row.uploadMessage ?? 'Upload failed.'}</span>
                      <button
                        type="button"
                        className="btn btn-tt-tertiary btn-sm ms-auto"
                        onClick={() => handleRetryUpload(index)}
                      >
                        Retry
                      </button>
                    </>
                  )}
                </li>
              ))}
          </ul>
        )}
        <button type="button" className="btn btn-tt-primary" onClick={handleCreateAnother}>
          Create Another Ticket
        </button>
      </div>
    );
  }

  return (
    <div className="create-ticket">
      <h1>Create Ticket</h1>

      {submitError && (
        <div className="alert alert-danger tt-alert-error" role="alert">
          {submitError}
        </div>
      )}

      <form noValidate onSubmit={handleSubmit}>
        {/* ui-spec.md 8: system-generated and read-only fields sit in a row at the top on
            desktop and tablet, stacking below 768px. Ticket Number and Ticket Date are assigned
            by the server on creation (BR-04), so before submission there is nothing to show. */}
        <div className="row mb-3">
          <div className="col-12 col-md-4">
            <label htmlFor="requester" className="form-label">Requester</label>
            <input id="requester" type="text" className="form-control tt-field-readonly" value={requester?.name ?? ''} readOnly />
          </div>
          <div className="col-12 col-md-4">
            <label htmlFor="ticketNumber" className="form-label">Ticket Number</label>
            <input id="ticketNumber" type="text" className="form-control tt-field-readonly" value="Generated on submit" readOnly />
          </div>
          <div className="col-12 col-md-4">
            <label htmlFor="ticketDate" className="form-label">Ticket Date</label>
            <input id="ticketDate" type="text" className="form-control tt-field-readonly" value="Set by the server on submit" readOnly />
          </div>
        </div>

        <div className="mb-3">
          <label htmlFor="category" className="form-label tt-required">
            Category
          </label>
          <select
            id="category"
            className={`form-select${showError('categoryId') ? ' is-invalid' : ''}`}
            value={values.categoryId}
            onChange={handleChange('categoryId')}
            onBlur={handleBlur('categoryId')}
            disabled={referenceState !== 'loaded'}
          >
            <option value="" disabled>
              {referenceState === 'loaded' ? 'Choose a Category…' : 'Loading…'}
            </option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
          {showError('categoryId') && <div className="invalid-feedback d-block">{errors.categoryId}</div>}
        </div>

        <div className="mb-3">
          <label htmlFor="relatedSystem" className="form-label tt-required">
            Related System
          </label>
          <select
            id="relatedSystem"
            className={`form-select${showError('relatedSystemId') ? ' is-invalid' : ''}`}
            value={values.relatedSystemId}
            onChange={handleChange('relatedSystemId')}
            onBlur={handleBlur('relatedSystemId')}
            disabled={referenceState !== 'loaded'}
          >
            <option value="" disabled>
              {referenceState === 'loaded' ? 'Choose a Related System…' : 'Loading…'}
            </option>
            {relatedSystems.map((relatedSystem) => (
              <option key={relatedSystem.id} value={relatedSystem.id}>
                {relatedSystem.name}
              </option>
            ))}
          </select>
          {showError('relatedSystemId') && (
            <div className="invalid-feedback d-block">{errors.relatedSystemId}</div>
          )}
        </div>

        {referenceState === 'error' && (
          <div className="alert alert-danger tt-alert-error" role="alert">
            Unable to load Categories or Related Systems. Please try again.
          </div>
        )}

        <div className="mb-3">
          <label htmlFor="summary" className="form-label tt-required">
            Summary
          </label>
          <input
            id="summary"
            type="text"
            className={`form-control${showError('summary') ? ' is-invalid' : ''}`}
            value={values.summary}
            onChange={handleChange('summary')}
            onBlur={handleBlur('summary')}
          />
          {showError('summary') && <div className="invalid-feedback d-block">{errors.summary}</div>}
        </div>

        <div className="mb-3">
          <label htmlFor="description" className="form-label tt-required">
            Description
          </label>
          <textarea
            id="description"
            className={`form-control${showError('description') ? ' is-invalid' : ''}`}
            rows={5}
            value={values.description}
            onChange={handleChange('description')}
            onBlur={handleBlur('description')}
          />
          {showError('description') && <div className="invalid-feedback d-block">{errors.description}</div>}
        </div>

        <div className="mb-3">
          <label htmlFor="requestedPriority" className="form-label tt-required">
            Requested Priority
          </label>
          <select
            id="requestedPriority"
            className={`form-select${showError('requestedPriority') ? ' is-invalid' : ''}`}
            value={values.requestedPriority}
            onChange={handleChange('requestedPriority')}
            onBlur={handleBlur('requestedPriority')}
          >
            <option value="" disabled>
              Choose a Priority…
            </option>
            {REQUESTED_PRIORITIES.map((priority) => (
              <option key={priority} value={priority}>
                {priority.charAt(0) + priority.slice(1).toLowerCase()}
              </option>
            ))}
          </select>
          {showError('requestedPriority') && (
            <div className="invalid-feedback d-block">{errors.requestedPriority}</div>
          )}
        </div>

        <div className="mb-3">
          <label htmlFor="attachments" className="form-label">
            Attachments
          </label>
          <input
            id="attachments"
            type="file"
            className="form-control"
            multiple
            accept=".jpg,.jpeg,.png,.webp,.pdf"
            onChange={handleFilesSelected}
          />
          <div className="form-text">
            Selected files are checked for type and size now, then uploaded once the Ticket is
            created.
          </div>
          {attachments.length > 0 && (
            <ul className="list-unstyled mt-2">
              {attachments.map((row, index) => (
                <li key={`${row.file.name}-${index}`} className="d-flex align-items-center gap-2 py-1">
                  <span className="badge text-bg-secondary">{fileTypeLabel(row.file)}</span>
                  <span>{row.file.name}</span>
                  <span className="text-muted">({formatFileSize(row.file.size)})</span>
                  {row.error && <span className="tt-inline-error">{row.error}</span>}
                  <button
                    type="button"
                    className="btn btn-tt-tertiary btn-sm ms-auto"
                    onClick={() => removeAttachment(index)}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <button
          type="submit"
          className={`btn btn-tt-primary${submitting ? ' tt-busy' : ''}`}
          disabled={submitting}
          aria-busy={submitting}
        >
          {submitting && <span className="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>}
          {submitting ? 'Submitting…' : 'Submit'}
        </button>
      </form>
    </div>
  );
}
