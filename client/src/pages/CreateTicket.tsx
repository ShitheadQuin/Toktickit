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

interface AttachmentRow {
  file: File;
  error: string | null;
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

  const errors = validate(values);

  const showError = (field: FieldName) => Boolean((touched[field] || submitAttempted) && errors[field]);

  const handleChange =
    (field: FieldName) =>
    (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      setValues((prev) => ({ ...prev, [field]: event.target.value }));
    };

  const handleBlur = (field: FieldName) => () => {
    setTouched((prev) => ({ ...prev, [field]: true }));
  };

  const handleFilesSelected = (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files) return;

    const nextRows: AttachmentRow[] = Array.from(files).map((file) => {
      if (!ALLOWED_ATTACHMENT_TYPES.includes(file.type)) {
        return { file, error: 'File type not allowed. Use JPG, PNG, WEBP, or PDF.' };
      }
      if (file.size > MAX_ATTACHMENT_BYTES) {
        return { file, error: 'File is over the 5 MB limit.' };
      }
      return { file, error: null };
    });

    setAttachments((prev) => [...prev, ...nextRows]);
    event.target.value = '';
  };

  const removeAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitAttempted(true);
    setSubmitError(null);

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
        throw new Error('Backend returned an error');
      }

      const created = await response.json();
      setSuccessTicketNumber(created.ticketNumber);
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
    setValues(initialValues);
    setTouched({});
    setSubmitAttempted(false);
    setAttachments([]);
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
        <div className="mb-3">
          <label className="form-label">Requester</label>
          <input type="text" className="form-control tt-field-readonly" value={requester?.name ?? ''} readOnly />
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
