import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ACTION_STATUS_BADGE_CLASS, FOLLOW_UP_FLAG_CLASS } from './badge-classes';

// docs/lab-04/ui-spec.md 7 and 10: the Actions Taken section. Staff get the list plus a create
// mode and a view/edit mode; a Requester gets the same list read-only. The server decides every
// rule (specification.md BR-03 to BR-12); this screen checks the same rules first only so the
// user sees each problem under its field before anything is sent.

interface Person {
  id: number;
  name: string;
}

export interface ActionTaken {
  id: number;
  ticketId: number;
  actionAt: string;
  description: string;
  result: string | null;
  status: string;
  performedBy: Person;
  assignee: Person;
  followUpRequired: boolean;
  followUpNote: string | null;
  attachmentNotes: string | null;
  version: number;
}

interface Props {
  ticketId: number;
  /** Staff may add and edit; a Requester only reads (BR-03). */
  editable: boolean;
  /** Closed and Cancelled Tickets take no new or changed Actions (BR-10). */
  ticketClosed: boolean;
  /** Active IT Staff and Administrators who can be assigned an Action (BR-05). */
  assignees: Person[];
  currentUser: Person | null;
  /** Called after any successful save, so the page can refresh what depends on Actions. */
  onChanged?: () => void;
}

const STATUS_LABEL: Record<string, string> = {
  PLANNED: 'Planned',
  IN_PROGRESS: 'In Progress',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};

// BR-09: what an Action may be created as, and where each status may move next.
const CREATE_STATUSES = ['PLANNED', 'IN_PROGRESS', 'COMPLETED'];
const NEXT_STATUSES: Record<string, string[]> = {
  PLANNED: ['IN_PROGRESS', 'COMPLETED', 'CANCELLED'],
  IN_PROGRESS: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
};
const isLocked = (status: string) => status === 'COMPLETED' || status === 'CANCELLED';

const MAX_TEXT = 2000;
const MAX_ATTACHMENT_NOTES = 500;

type FormValues = {
  actionAt: string;
  description: string;
  status: string;
  result: string;
  assigneeId: string;
  followUpRequired: boolean;
  followUpNote: string;
  attachmentNotes: string;
};
type FieldErrors = Partial<Record<keyof FormValues, string>>;
type Mode = { kind: 'create' } | { kind: 'edit'; action: ActionTaken } | null;
type FormAlert = { tone: 'error' | 'warning'; message: string; offerReload?: boolean } | null;

// Stored in UTC, shown in Asia/Bangkok time (specification.md BR-24).
function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('en-GB', { timeZone: 'Asia/Bangkok', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// A datetime-local input works in the browser's local time, without seconds.
function toLocalInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function newRequestId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function valuesFor(action: ActionTaken | null, userId: number | undefined): FormValues {
  return {
    actionAt: toLocalInput(action ? new Date(action.actionAt) : new Date()),
    description: action?.description ?? '',
    status: action?.status ?? 'PLANNED',
    result: action?.result ?? '',
    assigneeId: String(action?.assignee.id ?? userId ?? ''),
    followUpRequired: action?.followUpRequired ?? false,
    followUpNote: action?.followUpNote ?? '',
    attachmentNotes: action?.attachmentNotes ?? '',
  };
}

// Same rules and wording as the server (BR-06 to BR-08); the server still checks everything.
function validate(values: FormValues): FieldErrors {
  const errors: FieldErrors = {};
  if (!values.actionAt || Number.isNaN(new Date(values.actionAt).getTime())) errors.actionAt = 'Action Date/Time must be a valid date and time.';
  const description = values.description.trim();
  if (!description) errors.description = 'Action Description is required.';
  else if (description.length > MAX_TEXT) errors.description = 'Action Description must be 2,000 characters or fewer.';
  const result = values.result.trim();
  if (result.length > MAX_TEXT) errors.result = 'Result must be 2,000 characters or fewer.';
  else if (!result && values.status === 'COMPLETED') errors.result = 'Result is required when the Action is Completed.';
  if (values.followUpRequired) {
    const note = values.followUpNote.trim();
    if (!note) errors.followUpNote = 'Follow Up Note is required when follow up is needed.';
    else if (note.length > MAX_TEXT) errors.followUpNote = 'Follow Up Note must be 2,000 characters or fewer.';
  }
  if (values.attachmentNotes.trim().length > MAX_ATTACHMENT_NOTES) errors.attachmentNotes = 'Attachment Notes must be 500 characters or fewer.';
  return errors;
}

const byWhenThenId = (a: ActionTaken, b: ActionTaken) => a.actionAt.localeCompare(b.actionAt) || a.id - b.id;

export function ActionsTakenSection({ ticketId, editable, ticketClosed, assignees, currentUser, onChanged }: Props) {
  const [actions, setActions] = useState<ActionTaken[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  const [mode, setMode] = useState<Mode>(null);
  const [values, setValues] = useState<FormValues>(() => valuesFor(null, currentUser?.id));
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formAlert, setFormAlert] = useState<FormAlert>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [confirmingCancel, setConfirmingCancel] = useState(false);

  // One id per opened create form, reused by every retry of it, so a retried save can never create
  // a second Action (BR-20). The ref also blocks a second click landing before React re-renders.
  const requestId = useRef(newRequestId());
  const submitting = useRef(false);
  const firstField = useRef<HTMLInputElement>(null);
  const addButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let cancelled = false;
    setLoadFailed(false);
    fetch(`/api/tickets/${ticketId}/actions`, { credentials: 'include' })
      .then(async (response) => {
        if (!response.ok) throw new Error(String(response.status));
        const body = await response.json();
        if (!cancelled) setActions(Array.isArray(body) ? (body as ActionTaken[]) : []);
      })
      .catch(() => {
        if (!cancelled) setLoadFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [ticketId, reloadToken]);

  // ui-spec.md 13: focus moves into the panel when it opens.
  useEffect(() => {
    if (mode) firstField.current?.focus();
  }, [mode]);

  const canWrite = editable && !ticketClosed;
  const editing = mode?.kind === 'edit' ? mode.action : null;
  const readOnlyForm = mode?.kind === 'edit' && (!canWrite || isLocked(mode.action.status));

  const openCreate = () => {
    requestId.current = newRequestId();
    setValues(valuesFor(null, currentUser?.id));
    setFieldErrors({});
    setFormAlert(null);
    setSaved(null);
    setMode({ kind: 'create' });
  };

  const openEdit = (action: ActionTaken) => {
    setValues(valuesFor(action, currentUser?.id));
    setFieldErrors({});
    setFormAlert(null);
    setSaved(null);
    setMode({ kind: 'edit', action });
  };

  const closeForm = () => {
    setMode(null);
    setConfirmingCancel(false);
    // ui-spec.md 13: focus returns to where the user started.
    setTimeout(() => addButton.current?.focus(), 0);
  };

  const reload = () => {
    closeForm();
    setActions(null);
    setReloadToken((token) => token + 1);
  };

  const set = <K extends keyof FormValues>(key: K, value: FormValues[K]) => setValues((current) => ({ ...current, [key]: value }));

  const save = async () => {
    if (submitting.current || !mode) return;
    const errors = validate(values);
    setFieldErrors(errors);
    setFormAlert(null);
    if (Object.keys(errors).length > 0) return;

    const payload = {
      actionAt: new Date(values.actionAt).toISOString(),
      description: values.description.trim(),
      status: values.status,
      result: values.result.trim() || null,
      assigneeId: Number(values.assigneeId),
      followUpRequired: values.followUpRequired,
      followUpNote: values.followUpRequired ? values.followUpNote.trim() : null,
      attachmentNotes: values.attachmentNotes.trim() || null,
    };
    const request =
      mode.kind === 'create'
        ? { url: `/api/staff/tickets/${ticketId}/actions`, method: 'POST', body: { ...payload, clientRequestId: requestId.current } }
        : { url: `/api/staff/actions/${mode.action.id}`, method: 'PATCH', body: { ...payload, expectedVersion: mode.action.version } };

    submitting.current = true;
    setBusy(true);
    try {
      const response = await fetch(request.url, {
        method: request.method,
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request.body),
      });
      const body = await response.json().catch(() => null);

      if (response.ok && body) {
        const savedAction = body as ActionTaken;
        setActions((current) => [...(current ?? []).filter((a) => a.id !== savedAction.id), savedAction].sort(byWhenThenId));
        setSaved('Action saved.');
        closeForm();
        onChanged?.();
        return;
      }

      const error = body?.error as { code?: string; message?: string; fields?: { field: string; message: string }[] } | undefined;
      if (response.status === 400 && error?.fields?.length) {
        const mapped: FieldErrors = {};
        for (const { field, message } of error.fields) {
          if (field in values) mapped[field as keyof FormValues] = message;
        }
        if (Object.keys(mapped).length > 0) {
          setFieldErrors(mapped);
          return;
        }
      }
      if (error?.code === 'STALE_UPDATE') {
        setFormAlert({ tone: 'warning', message: error.message ?? 'This Action changed while you were editing it.', offerReload: true });
        return;
      }
      if (error?.message && response.status < 500) {
        setFormAlert({ tone: 'error', message: error.message });
        return;
      }
      setFormAlert({ tone: 'error', message: 'Your action could not be saved. Your entries are kept, try again.' });
    } catch {
      setFormAlert({ tone: 'error', message: 'Your action could not be saved. Your entries are kept, try again.' });
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    // Cancelling keeps the record but ends the work, so it asks first (ui-spec.md 7).
    if (editing && values.status === 'CANCELLED' && editing.status !== 'CANCELLED') setConfirmingCancel(true);
    else void save();
  };

  const statusChoices = editing ? [editing.status, ...NEXT_STATUSES[editing.status] ?? []] : CREATE_STATUSES;
  const completed = actions?.filter((a) => a.status === 'COMPLETED').length ?? 0;
  const open = actions?.filter((a) => a.status === 'PLANNED' || a.status === 'IN_PROGRESS').length ?? 0;
  const invalid = (key: keyof FormValues) => (fieldErrors[key] ? ' is-invalid' : '');
  const errorFor = (key: keyof FormValues, id: string) =>
    fieldErrors[key] ? (
      <div id={`${id}-error`} className="invalid-feedback d-block">
        {fieldErrors[key]}
      </div>
    ) : null;
  const describedBy = (key: keyof FormValues, id: string) => (fieldErrors[key] ? `${id}-error` : undefined);
  const formTitle = mode?.kind === 'create' ? 'Add Action' : readOnlyForm ? 'View Action' : 'Edit Action';

  return (
    <section className="tt-actions-taken mb-4" aria-labelledby="actions-taken-heading">
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
        <div>
          <h2 id="actions-taken-heading" className="h5 mb-0">
            Actions Taken{actions ? ` (${actions.length})` : ''}
          </h2>
          {actions && actions.length > 0 && (
            <div className="tt-conversation-meta">
              {completed} completed, {open} open
            </div>
          )}
        </div>
        {canWrite && !mode && actions && (
          <button ref={addButton} type="button" className="btn btn-tt-primary btn-sm" onClick={openCreate}>
            Add Action
          </button>
        )}
      </div>

      {saved && (
        <div className="alert tt-alert-success mb-3" role="status">
          ✓ {saved}
        </div>
      )}

      {mode && (
        <form className="tt-action-form" aria-label={formTitle} noValidate onSubmit={onSubmit}>
          <h3 className="h6 mb-3">{formTitle}</h3>
          {readOnlyForm && (
            <p className="text-muted">
              {!canWrite ? 'Actions on a Closed or Cancelled Ticket cannot be changed.' : `${STATUS_LABEL[editing!.status]} Actions cannot be changed.`}
            </p>
          )}
          {formAlert && (
            <div className={`alert ${formAlert.tone === 'warning' ? 'tt-alert-warning' : 'tt-alert-error'} d-flex flex-wrap align-items-center gap-2`} role="alert">
              <span>{formAlert.message}</span>
              {formAlert.offerReload && (
                <button type="button" className="btn btn-tt-secondary btn-sm" onClick={reload}>
                  Reload
                </button>
              )}
            </div>
          )}

          <div className="row g-3">
            <div className="col-12 col-md-6 col-lg-4">
              <label htmlFor="action-at" className="form-label">
                Action Date/Time
              </label>
              <input
                ref={firstField}
                id="action-at"
                type="datetime-local"
                className={`form-control ${readOnlyForm ? 'tt-field-readonly' : 'tt-field'}${invalid('actionAt')}`}
                value={values.actionAt}
                readOnly={readOnlyForm}
                aria-invalid={Boolean(fieldErrors.actionAt)}
                aria-describedby={describedBy('actionAt', 'action-at')}
                onChange={(event) => set('actionAt', event.target.value)}
              />
              {errorFor('actionAt', 'action-at')}
            </div>
            <div className="col-12 col-md-6 col-lg-4">
              <label htmlFor="action-status" className="form-label">
                Status
              </label>
              {readOnlyForm ? (
                <input id="action-status" type="text" className="form-control tt-field-readonly" value={STATUS_LABEL[values.status] ?? values.status} readOnly />
              ) : (
                <select id="action-status" className="form-select tt-field" value={values.status} onChange={(event) => set('status', event.target.value)}>
                  {statusChoices.map((status) => (
                    <option key={status} value={status}>
                      {STATUS_LABEL[status] ?? status}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <div className="col-12 col-lg-4">
              <label htmlFor="action-performed-by" className="form-label">
                Performed By
              </label>
              <input
                id="action-performed-by"
                type="text"
                className="form-control tt-field-readonly"
                value={editing ? editing.performedBy.name : currentUser?.name ?? ''}
                readOnly
              />
            </div>

            <div className="col-12">
              <label htmlFor="action-description" className="form-label">
                Action Description <span aria-hidden="true">*</span>
              </label>
              <textarea
                id="action-description"
                className={`form-control ${readOnlyForm ? 'tt-field-readonly' : 'tt-field'}${invalid('description')}`}
                rows={3}
                maxLength={MAX_TEXT}
                value={values.description}
                readOnly={readOnlyForm}
                required
                aria-invalid={Boolean(fieldErrors.description)}
                aria-describedby={describedBy('description', 'action-description')}
                onChange={(event) => set('description', event.target.value)}
              />
              {errorFor('description', 'action-description')}
            </div>

            <div className="col-12">
              <label htmlFor="action-result" className="form-label">
                Result {values.status === 'COMPLETED' && <span aria-hidden="true">*</span>}
              </label>
              <textarea
                id="action-result"
                className={`form-control ${readOnlyForm ? 'tt-field-readonly' : 'tt-field'}${invalid('result')}`}
                rows={2}
                maxLength={MAX_TEXT}
                value={values.result}
                readOnly={readOnlyForm}
                required={values.status === 'COMPLETED'}
                aria-invalid={Boolean(fieldErrors.result)}
                aria-describedby={describedBy('result', 'action-result')}
                onChange={(event) => set('result', event.target.value)}
              />
              {errorFor('result', 'action-result')}
            </div>

            <div className="col-12 col-md-6">
              <label htmlFor="action-assignee" className="form-label">
                Assignee
              </label>
              {readOnlyForm ? (
                <input id="action-assignee" type="text" className="form-control tt-field-readonly" value={editing?.assignee.name ?? ''} readOnly />
              ) : (
                <select
                  id="action-assignee"
                  className={`form-select tt-field${invalid('assigneeId')}`}
                  value={values.assigneeId}
                  aria-invalid={Boolean(fieldErrors.assigneeId)}
                  aria-describedby={describedBy('assigneeId', 'action-assignee')}
                  onChange={(event) => set('assigneeId', event.target.value)}
                >
                  {/* The stored assignee stays selectable even if they are no longer in the list. */}
                  {editing && !assignees.some((p) => p.id === editing.assignee.id) && (
                    <option value={editing.assignee.id}>{editing.assignee.name}</option>
                  )}
                  {assignees.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.name}
                    </option>
                  ))}
                </select>
              )}
              {errorFor('assigneeId', 'action-assignee')}
            </div>

            <div className="col-12 col-md-6">
              <label htmlFor="action-attachment-notes" className="form-label">
                Attachment Notes
              </label>
              <input
                id="action-attachment-notes"
                type="text"
                className={`form-control ${readOnlyForm ? 'tt-field-readonly' : 'tt-field'}${invalid('attachmentNotes')}`}
                maxLength={MAX_ATTACHMENT_NOTES}
                placeholder={readOnlyForm ? undefined : 'Which file to look at, for example photo-1.jpg'}
                value={values.attachmentNotes}
                readOnly={readOnlyForm}
                aria-invalid={Boolean(fieldErrors.attachmentNotes)}
                aria-describedby={describedBy('attachmentNotes', 'action-attachment-notes')}
                onChange={(event) => set('attachmentNotes', event.target.value)}
              />
              {errorFor('attachmentNotes', 'action-attachment-notes')}
            </div>

            <div className="col-12">
              <div className="form-check">
                <input
                  id="action-follow-up"
                  type="checkbox"
                  className="form-check-input"
                  checked={values.followUpRequired}
                  disabled={readOnlyForm}
                  onChange={(event) => set('followUpRequired', event.target.checked)}
                />
                <label htmlFor="action-follow-up" className="form-check-label">
                  Follow Up Required
                </label>
              </div>
            </div>

            {values.followUpRequired && (
              <div className="col-12">
                <label htmlFor="action-follow-up-note" className="form-label">
                  Follow Up Note <span aria-hidden="true">*</span>
                </label>
                <textarea
                  id="action-follow-up-note"
                  className={`form-control ${readOnlyForm ? 'tt-field-readonly' : 'tt-field'}${invalid('followUpNote')}`}
                  rows={2}
                  maxLength={MAX_TEXT}
                  value={values.followUpNote}
                  readOnly={readOnlyForm}
                  required
                  aria-invalid={Boolean(fieldErrors.followUpNote)}
                  aria-describedby={describedBy('followUpNote', 'action-follow-up-note')}
                  onChange={(event) => set('followUpNote', event.target.value)}
                />
                {errorFor('followUpNote', 'action-follow-up-note')}
              </div>
            )}
          </div>

          <div className="d-flex flex-wrap gap-2 mt-3">
            {!readOnlyForm && (
              <button type="submit" className="btn btn-tt-primary" disabled={busy}>
                {busy ? 'Saving…' : mode.kind === 'create' ? 'Save Action' : 'Save Changes'}
              </button>
            )}
            <button type="button" className="btn btn-tt-tertiary" onClick={closeForm}>
              {readOnlyForm ? 'Close' : 'Cancel'}
            </button>
          </div>
        </form>
      )}

      {loadFailed && (
        <div className="alert tt-alert-error" role="alert">
          <p className="mb-2">Actions Taken could not be loaded right now.</p>
          <button type="button" className="btn btn-tt-secondary btn-sm" onClick={() => setReloadToken((token) => token + 1)}>
            Try again
          </button>
        </div>
      )}

      {!loadFailed && actions === null && (
        <div className="tt-skeleton-list" aria-busy="true">
          <span className="visually-hidden">Loading Actions Taken…</span>
          <div className="tt-skeleton-row" />
        </div>
      )}

      {actions && actions.length === 0 && <p className="text-muted mb-0">No actions recorded yet.</p>}

      {actions && actions.length > 0 && (
        <table className="table tt-actions-table mb-0">
          <thead>
            <tr>
              <th scope="col" className="tt-actions-head-date">Date/Time</th>
              <th scope="col">Description</th>
              <th scope="col" className="tt-actions-head-assignee">Assignee</th>
              <th scope="col" className="tt-actions-head-status">Status</th>
              <th scope="col" className="tt-actions-head-follow">Follow Up</th>
              <th scope="col" className="tt-actions-head-performer">Performed By</th>
              {editable && (
                <th scope="col" className="tt-actions-head-open">
                  <span className="visually-hidden">Open</span>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {actions.map((action) => (
              <tr key={action.id} className={editing?.id === action.id ? 'tt-actions-selected' : undefined}>
                <td data-label="Date/Time">{formatDateTime(action.actionAt)}</td>
                <td className="tt-actions-description">
                  {action.description}
                  {action.result && <div className="tt-conversation-meta">Result: {action.result}</div>}
                  {action.followUpRequired && action.followUpNote && <div className="tt-conversation-meta">Follow up: {action.followUpNote}</div>}
                  {action.attachmentNotes && <div className="tt-conversation-meta">Attachment notes: {action.attachmentNotes}</div>}
                </td>
                <td data-label="Assignee">{action.assignee.name}</td>
                <td data-label="Status">
                  <span className={`tt-badge ${ACTION_STATUS_BADGE_CLASS[action.status] ?? ''}`}>{STATUS_LABEL[action.status] ?? action.status}</span>
                </td>
                <td data-label="Follow Up">{action.followUpRequired ? <span className={FOLLOW_UP_FLAG_CLASS}>Follow up</span> : <span className="text-muted">None</span>}</td>
                <td data-label="Performed By">{action.performedBy.name}</td>
                {editable && (
                  <td>
                    <button
                      type="button"
                      className="btn btn-tt-tertiary btn-sm"
                      aria-label={`Open action: ${action.description}`}
                      onClick={() => openEdit(action)}
                    >
                      Open
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {confirmingCancel && (
        <div className="tt-confirm-backdrop">
          <div className="tt-confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="action-cancel-title">
            <h2 id="action-cancel-title" className="h5 mb-2">
              Cancel this Action?
            </h2>
            <p className="mb-3">The Action is kept in the list as Cancelled and can no longer be changed.</p>
            <div className="d-flex justify-content-end gap-2">
              <button type="button" className="btn btn-tt-tertiary" onClick={() => setConfirmingCancel(false)}>
                Go back
              </button>
              <button
                type="button"
                className="btn btn-tt-destructive"
                onClick={() => {
                  setConfirmingCancel(false);
                  void save();
                }}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
