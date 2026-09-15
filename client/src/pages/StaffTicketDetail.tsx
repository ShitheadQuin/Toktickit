import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { STATUS_BADGE_CLASS } from '../components/badge-classes';
import { CONFIRM_BEFORE, STATUS_TRANSITIONS } from '../components/status-transitions';
import { ConversationPanel, type ConversationEntry } from '../components/ConversationPanel';

interface Person {
  id: number;
  name: string;
}

interface StaffAttachment {
  id: number;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  isActive: boolean;
  removalReason: string | null;
}

interface StaffTicket {
  id: number;
  ticketNumber: string;
  ticketDate: string;
  summary: string;
  description: string;
  requestedPriority: string;
  itPriority: string;
  currentStatus: string;
  requesterConfirmedAt: string | null;
  requester: Person & { email: string };
  owner: Person | null;
  category: Person | null;
  relatedSystem: Person | null;
  attachments: StaffAttachment[];
}

type LoadStatus = 'loading' | 'success' | 'not-found' | 'error';
type Tab = 'comments' | 'notes' | 'attachments';
type Feedback = { tone: 'success' | 'error'; message: string } | null;

// ui-spec.md 9: every badge shows its word, never color alone.
const PRIORITY_LABEL: Record<string, string> = { LOW: 'Low', MEDIUM: 'Medium', HIGH: 'High' };
const STATUS_LABEL: Record<string, string> = {
  NEW: 'New',
  OPEN: 'Open',
  IN_PROGRESS: 'In Progress',
  WAITING_FOR_REQUESTER: 'Waiting for Requester',
  RESOLVED: 'Resolved',
  CLOSED: 'Closed',
  REOPENED: 'Reopened',
  CANCELLED: 'Cancelled',
};

const TABS: { key: Tab; label: string }[] = [
  { key: 'comments', label: 'Public Comments' },
  { key: 'notes', label: 'Internal Notes' },
  { key: 'attachments', label: 'Attachments' },
];

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function getJson(url: string): Promise<unknown> {
  const response = await fetch(url, { credentials: 'include' });
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return response.json();
}

// ui-spec.md 7/10: IT Staff Ticket Detail. The Ticket fields stay read-only, as on the Lab 2 detail
// screen; the operational controls (owner, IT Priority, status) sit in their own panel; Public
// Comments, Internal Notes and Attachments are tabs below. The server decides every change - this
// screen only shows what it will accept, and the server's message when it doesn't.
export function StaffTicketDetail() {
  const { id } = useParams();
  const { user } = useAuth();

  const [loadStatus, setLoadStatus] = useState<LoadStatus>('loading');
  const [ticket, setTicket] = useState<StaffTicket | null>(null);
  const [retryToken, setRetryToken] = useState(0);

  const [staff, setStaff] = useState<Person[]>([]);
  const [comments, setComments] = useState<ConversationEntry[] | null>(null);
  const [notes, setNotes] = useState<ConversationEntry[] | null>(null);
  const [failedLists, setFailedLists] = useState({ comments: false, notes: false });

  const [tab, setTab] = useState<Tab>('comments');
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [busy, setBusy] = useState(false);
  const [newOwnerId, setNewOwnerId] = useState('');
  const [nextStatus, setNextStatus] = useState('');
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (!user) return;

    let cancelled = false;
    setLoadStatus('loading');
    setTicket(null);

    fetch(`/api/staff/tickets/${id}`, { credentials: 'include' })
      .then(async (response) => {
        if (cancelled) return;
        if (response.status === 404) {
          setLoadStatus('not-found');
          return;
        }
        const body = response.ok ? ((await response.json().catch(() => null)) as StaffTicket | null) : null;
        if (!body) {
          setLoadStatus('error');
          return;
        }
        setTicket(body);
        setLoadStatus('success');
      })
      .catch(() => {
        if (!cancelled) setLoadStatus('error');
      });

    return () => {
      cancelled = true;
    };
  }, [id, user, retryToken]);

  // The owner list, comments and notes load once the Ticket itself has. Each fails on its own, so a
  // missing notes list never hides the Ticket or its comments.
  useEffect(() => {
    if (!user || loadStatus !== 'success') return;

    let cancelled = false;
    getJson('/api/staff/assignable-users')
      .then((body) => !cancelled && setStaff(Array.isArray(body) ? (body as Person[]) : []))
      .catch(() => !cancelled && setStaff([]));
    getJson(`/api/tickets/${id}/comments`)
      .then((body) => !cancelled && setComments(Array.isArray(body) ? (body as ConversationEntry[]) : []))
      .catch(() => !cancelled && setFailedLists((current) => ({ ...current, comments: true })));
    getJson(`/api/tickets/${id}/notes`)
      .then((body) => !cancelled && setNotes(Array.isArray(body) ? (body as ConversationEntry[]) : []))
      .catch(() => !cancelled && setFailedLists((current) => ({ ...current, notes: true })));

    return () => {
      cancelled = true;
    };
  }, [id, user, loadStatus]);

  // Every action returns the updated Ticket, so the screen re-renders from the response. On a
  // refusal the Ticket is left as it was and the server's own message is shown (409 conflict,
  // 403 not owner, 400 validation) - never a generic failure for an anticipated state.
  const act = async (path: string, method: 'POST' | 'PATCH', body: object | undefined, successMessage: string) => {
    setBusy(true);
    setFeedback(null);
    try {
      const response = await fetch(`/api/staff/tickets/${id}/${path}`, {
        method,
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload) {
        setFeedback({ tone: 'error', message: payload?.error?.message ?? 'Unable to save this change right now.' });
        return false;
      }
      setTicket(payload as StaffTicket);
      setFeedback({ tone: 'success', message: successMessage });
      return true;
    } catch {
      setFeedback({ tone: 'error', message: 'Unable to reach the server. Please try again.' });
      return false;
    } finally {
      setBusy(false);
    }
  };

  const applyStatus = async () => {
    if (await act('status', 'PATCH', { status: nextStatus }, 'Status updated.')) setNextStatus('');
  };

  // BR-18: Cancel and Reopen ask first; every other move applies straight away.
  const requestStatusChange = () => {
    if (CONFIRM_BEFORE[nextStatus]) setConfirming(true);
    else void applyStatus();
  };

  return (
    <section className="tt-ticket-detail tt-staff-ticket-detail">
      <h1 className="h4 mb-3">Ticket Detail</h1>

      {loadStatus === 'loading' && (
        <div className="tt-skeleton-list" aria-busy="true">
          <span className="visually-hidden">Loading Ticket…</span>
          {[0, 1, 2].map((row) => (
            <div key={row} className="tt-skeleton-row" />
          ))}
        </div>
      )}

      {loadStatus === 'not-found' && (
        <div className="alert tt-alert-error" role="alert">
          <p className="mb-2">This Ticket does not exist.</p>
          <Link to="/staff/queue" className="btn btn-tt-secondary">
            Back to My Queue
          </Link>
        </div>
      )}

      {loadStatus === 'error' && (
        <div className="alert tt-alert-error" role="alert">
          <p className="mb-2">Unable to load this Ticket right now.</p>
          <button type="button" className="btn btn-tt-secondary btn-sm" onClick={() => setRetryToken((token) => token + 1)}>
            Try again
          </button>
        </div>
      )}

      {loadStatus === 'success' && ticket && user && (
        <>
          <div className="row mb-3">
            <div className="col-12 col-md-4">
              <label htmlFor="staff-ticket-number" className="form-label">
                Ticket Number
              </label>
              <input id="staff-ticket-number" type="text" className="form-control tt-field-readonly" value={ticket.ticketNumber} readOnly />
            </div>
            <div className="col-12 col-md-4">
              <label htmlFor="staff-ticket-date" className="form-label">
                Ticket Date
              </label>
              <input id="staff-ticket-date" type="text" className="form-control tt-field-readonly" value={formatDate(ticket.ticketDate)} readOnly />
            </div>
            <div className="col-12 col-md-4">
              <span className="form-label d-block">Current Status</span>
              <div className="d-flex flex-wrap align-items-center gap-2">
                <span className={`tt-badge ${STATUS_BADGE_CLASS[ticket.currentStatus] ?? ''}`}>
                  {STATUS_LABEL[ticket.currentStatus] ?? ticket.currentStatus}
                </span>
                {/* ui-spec.md 5, BR-05: the Requester's signal is shown, but it never changes the status. */}
                {ticket.requesterConfirmedAt && <span className="tt-badge tt-requester-confirmed">Requester confirmed</span>}
              </div>
            </div>
          </div>

          <div className="row mb-3">
            <div className="col-12 col-md-4">
              <span className="form-label d-block">Requester</span>
              <div>{ticket.requester.name}</div>
              <div className="tt-conversation-meta">{ticket.requester.email}</div>
            </div>
            <div className="col-12 col-md-4">
              <label htmlFor="staff-category" className="form-label">
                Category
              </label>
              <input id="staff-category" type="text" className="form-control tt-field-readonly" value={ticket.category?.name ?? '—'} readOnly />
            </div>
            <div className="col-12 col-md-4">
              <label htmlFor="staff-related-system" className="form-label">
                Related System
              </label>
              <input
                id="staff-related-system"
                type="text"
                className="form-control tt-field-readonly"
                value={ticket.relatedSystem?.name ?? '—'}
                readOnly
              />
            </div>
          </div>

          <div className="mb-3">
            <label htmlFor="staff-summary" className="form-label">
              Summary
            </label>
            <input id="staff-summary" type="text" className="form-control tt-field-readonly" value={ticket.summary} readOnly />
          </div>
          <div className="mb-4">
            <label htmlFor="staff-description" className="form-label">
              Description
            </label>
            <textarea id="staff-description" className="form-control tt-field-readonly" value={ticket.description} readOnly rows={4} />
          </div>

          <StaffControls
            ticket={ticket}
            userId={user.id}
            staff={staff}
            busy={busy}
            feedback={feedback}
            newOwnerId={newOwnerId}
            nextStatus={nextStatus}
            onNewOwnerChange={setNewOwnerId}
            onNextStatusChange={setNextStatus}
            onClaim={() => void act('claim', 'POST', undefined, 'Ticket claimed.')}
            onReassign={async () => {
              if (await act('reassign', 'POST', { newOwnerId: Number(newOwnerId) }, 'Ticket reassigned.')) setNewOwnerId('');
            }}
            onPriorityChange={(itPriority) => void act('priority', 'PATCH', { itPriority }, 'IT Priority updated.')}
            onUpdateStatus={requestStatusChange}
          />

          <div className="tt-tabs mt-4" role="tablist" aria-label="Ticket conversation and files">
            {TABS.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                role="tab"
                id={`staff-tab-${key}`}
                aria-selected={tab === key}
                aria-controls={`staff-panel-${key}`}
                className="tt-tab"
                onClick={() => setTab(key)}
              >
                {label}
              </button>
            ))}
          </div>
          {/* Only the active tab is rendered, so a comment and a note can never share the screen. */}
          <div role="tabpanel" id={`staff-panel-${tab}`} aria-labelledby={`staff-tab-${tab}`} className="pt-3">
            {tab === 'comments' && (
              <ConversationPanel
                kind="comment"
                ticketId={ticket.id}
                entries={comments}
                loadFailed={failedLists.comments}
                onPosted={(entry) => setComments((current) => [...(current ?? []), entry])}
              />
            )}
            {tab === 'notes' && (
              <ConversationPanel
                kind="note"
                ticketId={ticket.id}
                entries={notes}
                loadFailed={failedLists.notes}
                onPosted={(entry) => setNotes((current) => [...(current ?? []), entry])}
              />
            )}
            {tab === 'attachments' && <StaffAttachmentList attachments={ticket.attachments} />}
          </div>

          <div className="mt-4">
            <Link to="/staff/queue" className="btn btn-tt-secondary">
              Back to My Queue
            </Link>
          </div>

          {confirming && (
            <div className="tt-confirm-backdrop">
              <div className="tt-confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="staff-confirm-title">
                <h2 id="staff-confirm-title" className="h5 mb-3">
                  {CONFIRM_BEFORE[nextStatus]}
                </h2>
                <div className="d-flex justify-content-end gap-2">
                  <button type="button" className="btn btn-tt-tertiary" onClick={() => setConfirming(false)}>
                    Go back
                  </button>
                  <button
                    type="button"
                    className="btn btn-tt-destructive"
                    onClick={() => {
                      setConfirming(false);
                      void applyStatus();
                    }}
                  >
                    Confirm
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}

interface StaffControlsProps {
  ticket: StaffTicket;
  userId: number;
  staff: Person[];
  busy: boolean;
  feedback: Feedback;
  newOwnerId: string;
  nextStatus: string;
  onNewOwnerChange: (value: string) => void;
  onNextStatusChange: (value: string) => void;
  onClaim: () => void;
  onReassign: () => void;
  onPriorityChange: (value: string) => void;
  onUpdateStatus: () => void;
}

// The only editable part of the screen (ui-spec.md 7): owner, IT Priority and status.
function StaffControls({
  ticket,
  userId,
  staff,
  busy,
  feedback,
  newOwnerId,
  nextStatus,
  onNewOwnerChange,
  onNextStatusChange,
  onClaim,
  onReassign,
  onPriorityChange,
  onUpdateStatus,
}: StaffControlsProps) {
  const isOwner = ticket.owner?.id === userId;
  // Claim only applies to an unassigned New Ticket; any other unassigned Ticket is assigned below.
  const canClaim = ticket.owner === null && ticket.currentStatus === 'NEW';
  const transitions = STATUS_TRANSITIONS[ticket.currentStatus] ?? [];

  return (
    <section className="tt-staff-controls" aria-label="Ticket actions">
      {feedback && (
        <div
          className={`alert ${feedback.tone === 'success' ? 'tt-alert-success' : 'tt-alert-error'} mb-3`}
          role={feedback.tone === 'success' ? 'status' : 'alert'}
        >
          {feedback.message}
        </div>
      )}

      <div className="row g-3">
        <div className="col-12 col-lg-4">
          <span className="form-label d-block">Ticket Owner</span>
          <p className="mb-2">{ticket.owner ? ticket.owner.name : <span className="tt-queue-unassigned">Unassigned</span>}</p>
          {canClaim && (
            <button type="button" className="btn btn-tt-primary btn-sm mb-2" disabled={busy} onClick={onClaim}>
              Claim
            </button>
          )}
          <label htmlFor="staff-assign-to" className="form-label">
            Assign to
          </label>
          <div className="d-flex gap-2">
            <select
              id="staff-assign-to"
              className="form-select tt-field"
              value={newOwnerId}
              onChange={(event) => onNewOwnerChange(event.target.value)}
              disabled={busy}
            >
              <option value="">Choose IT Staff</option>
              {staff
                .filter((person) => person.id !== ticket.owner?.id)
                .map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.name}
                  </option>
                ))}
            </select>
            <button type="button" className="btn btn-tt-secondary" disabled={busy || !newOwnerId} onClick={onReassign}>
              Reassign
            </button>
          </div>
        </div>

        <div className="col-12 col-md-6 col-lg-3">
          {/* BR-15: any IT Staff member may set IT Priority, owner or not. Saves on change. */}
          <label htmlFor="staff-it-priority" className="form-label">
            IT Priority
          </label>
          <select
            id="staff-it-priority"
            className="form-select tt-field"
            value={ticket.itPriority}
            onChange={(event) => onPriorityChange(event.target.value)}
            disabled={busy}
          >
            {Object.entries(PRIORITY_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <div className="tt-conversation-meta mt-1">
            Requested: <span className={`tt-badge tt-badge-priority-${ticket.requestedPriority.toLowerCase()}`}>{PRIORITY_LABEL[ticket.requestedPriority] ?? ticket.requestedPriority}</span>
          </div>
        </div>

        <div className="col-12 col-md-6 col-lg-5">
          {transitions.length === 0 ? (
            <>
              <span className="form-label d-block">Change status</span>
              <p className="text-muted mb-0">No further status changes.</p>
            </>
          ) : (
            <>
              <label htmlFor="staff-change-status" className="form-label">
                Change status
              </label>
              <div className="d-flex gap-2">
                <select
                  id="staff-change-status"
                  className="form-select tt-field"
                  value={nextStatus}
                  onChange={(event) => onNextStatusChange(event.target.value)}
                  disabled={busy}
                >
                  <option value="">Choose a new status</option>
                  {/* ui-spec.md 7: an owner-required move is disabled with a tooltip, not hidden, so
                      the control still shows the workflow to someone who can't take that step. */}
                  {transitions.map((transition) => {
                    const blocked = transition.requiresOwnership && !isOwner;
                    return (
                      <option
                        key={transition.to}
                        value={transition.to}
                        disabled={blocked}
                        title={blocked ? 'Claim this ticket first' : undefined}
                        className={blocked ? 'tt-disabled-not-owner' : undefined}
                      >
                        {STATUS_LABEL[transition.to] ?? transition.to}
                      </option>
                    );
                  })}
                </select>
                <button type="button" className="btn btn-tt-primary" disabled={busy || !nextStatus} onClick={onUpdateStatus}>
                  Update status
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

// Attachment continuity (api-spec.md 4): the Requester's files, read-only for IT Staff - download
// through the staff endpoint, no upload and no remove.
function StaffAttachmentList({ attachments }: { attachments: StaffAttachment[] }) {
  if (attachments.length === 0) return <p className="text-muted">No attachments.</p>;

  return (
    <ul className="list-unstyled tt-attachment-list">
      {attachments.map((attachment) => (
        <li key={attachment.id} className="tt-attachment-row mb-2">
          {attachment.isActive ? (
            <div className="d-flex align-items-center gap-2 flex-wrap">
              <span aria-hidden="true">{attachment.mimeType.startsWith('image/') ? '🖼️' : '📄'}</span>
              <span>{attachment.originalFilename}</span>
              <span className="text-muted">({formatBytes(attachment.sizeBytes)})</span>
              <a
                href={`/api/staff/attachments/${attachment.id}/download`}
                className="btn btn-tt-tertiary btn-sm"
                aria-label={`Download ${attachment.originalFilename}`}
              >
                Download
              </a>
            </div>
          ) : (
            <span className="text-muted">
              {attachment.originalFilename} — Removed
              {attachment.removalReason ? ` — ${attachment.removalReason}` : ''}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}
