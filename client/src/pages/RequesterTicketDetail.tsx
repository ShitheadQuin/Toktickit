import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { AttachmentSection, type Attachment } from '../components/AttachmentSection';
import { STATUS_BADGE_CLASS } from '../components/badge-classes';
import { ConversationPanel, type ConversationEntry } from '../components/ConversationPanel';

interface ReferenceItem {
  id: number;
  name: string;
}

type CurrentStatus =
  | 'NEW'
  | 'OPEN'
  | 'IN_PROGRESS'
  | 'WAITING_FOR_REQUESTER'
  | 'RESOLVED'
  | 'CLOSED'
  | 'REOPENED'
  | 'CANCELLED';

interface TicketDetail {
  id: number;
  ticketNumber: string;
  ticketDate: string;
  updatedAt: string;
  summary: string;
  description: string;
  requestedPriority: 'LOW' | 'MEDIUM' | 'HIGH';
  currentStatus: CurrentStatus;
  category: ReferenceItem;
  relatedSystem: ReferenceItem;
  attachments: Attachment[];
  requesterConfirmedAt: string | null;
}

// ui-spec.md 12: every badge shows its word, so state is never carried by color alone. See
// MyTickets.tsx for why the full 8-value set is here, not just NEW.
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

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

type Status = 'loading' | 'success' | 'not-found' | 'error';

// ui-spec.md 14: Requester Ticket Detail, read-only. AC-21: full detail for an owned Ticket.
// BR-12 (Lab 3): a Ticket that exists but belongs to someone else is 404, identical to one that
// doesn't exist - so there is no separate "forbidden" state here anymore, only not-found.
export function RequesterTicketDetail() {
  const { id } = useParams();
  const { user } = useAuth();

  const [status, setStatus] = useState<Status>('loading');
  const [ticket, setTicket] = useState<TicketDetail | null>(null);
  const [retryToken, setRetryToken] = useState(0);

  // Lab 3 (#38): the Public Comments panel and the "Problem Appears Resolved" signal.
  const [comments, setComments] = useState<ConversationEntry[] | null>(null);
  const [commentsFailed, setCommentsFailed] = useState(false);
  const [confirmingSignal, setConfirmingSignal] = useState(false);
  const [signalBusy, setSignalBusy] = useState(false);
  const [signalFeedback, setSignalFeedback] = useState<{ tone: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    if (!user) return;

    let cancelled = false;
    setStatus('loading');
    setTicket(null);

    fetch(`/api/tickets/${id}`, { credentials: 'include' })
      .then(async (response) => {
        if (cancelled) return;
        if (response.status === 404) {
          setStatus('not-found');
          return;
        }
        if (!response.ok) {
          setStatus('error');
          return;
        }
        const body = (await response.json().catch(() => null)) as TicketDetail | null;
        if (!body) {
          setStatus('error');
          return;
        }
        setTicket(body);
        setStatus('success');
      })
      .catch(() => {
        if (cancelled) return;
        setStatus('error');
      });

    return () => {
      cancelled = true;
    };
  }, [id, user, retryToken]);

  // ui-spec.md 5: the Public Comments panel loads once the Ticket itself has. A failure here only
  // affects the panel - the Ticket stays on screen. Internal Notes are never requested (BR-04).
  useEffect(() => {
    if (!user || status !== 'success') return;

    let cancelled = false;
    fetch(`/api/tickets/${id}/comments`, { credentials: 'include' })
      .then(async (response) => {
        if (!response.ok) throw new Error('Comments request failed');
        const body = await response.json().catch(() => null);
        if (!cancelled) setComments(Array.isArray(body) ? (body as ConversationEntry[]) : []);
      })
      .catch(() => {
        if (!cancelled) setCommentsFailed(true);
      });

    return () => {
      cancelled = true;
    };
  }, [id, user, status]);

  // BR-05, api-spec.md 3: records the signal only. The status badge on this screen never changes -
  // IT Staff still formally resolve the Ticket.
  const sendResolutionSignal = async () => {
    setConfirmingSignal(false);
    setSignalBusy(true);
    setSignalFeedback(null);
    try {
      const response = await fetch(`/api/tickets/${id}/resolution-signal`, { method: 'POST', credentials: 'include' });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload) {
        setSignalFeedback({ tone: 'error', message: payload?.error?.message ?? 'Unable to send this right now.' });
        return;
      }
      setTicket((current) => (current ? { ...current, requesterConfirmedAt: payload.requesterConfirmedAt } : current));
      setSignalFeedback({ tone: 'success', message: 'Thanks — IT Staff can now see that the problem looks fixed.' });
    } catch {
      setSignalFeedback({ tone: 'error', message: 'Unable to reach the server. Please try again.' });
    } finally {
      setSignalBusy(false);
    }
  };

  return (
    <section className="tt-ticket-detail">
      <h1 className="h4 mb-3">Ticket Detail</h1>

      {status === 'loading' && (
        <div className="tt-skeleton-list" aria-busy="true">
          <span className="visually-hidden">Loading Ticket…</span>
          {[0, 1, 2].map((row) => (
            <div key={row} className="tt-skeleton-row" />
          ))}
        </div>
      )}

      {status === 'not-found' && (
        <div className="alert tt-alert-error" role="alert">
          <p className="mb-2">This Ticket does not exist.</p>
          <Link to="/my-tickets" className="btn btn-tt-secondary">
            Back to My Tickets
          </Link>
        </div>
      )}

      {status === 'error' && (
        <div className="alert tt-alert-error" role="alert">
          <p className="mb-2">Unable to load this Ticket right now.</p>
          <button
            type="button"
            className="btn btn-tt-secondary btn-sm"
            onClick={() => setRetryToken((token) => token + 1)}
          >
            Try again
          </button>
        </div>
      )}

      {status === 'success' && ticket && (
        <>
          {/* ui-spec.md 14: Ticket Number, Ticket Date, Current Status badge across the top. */}
          <div className="row mb-3">
            <div className="col-12 col-md-4">
              <label htmlFor="ticketNumber" className="form-label">
                Ticket Number
              </label>
              <input
                id="ticketNumber"
                type="text"
                className="form-control tt-field-readonly"
                value={ticket.ticketNumber}
                readOnly
              />
            </div>
            <div className="col-12 col-md-4">
              <label htmlFor="ticketDate" className="form-label">
                Ticket Date
              </label>
              <input
                id="ticketDate"
                type="text"
                className="form-control tt-field-readonly"
                value={formatDate(ticket.ticketDate)}
                readOnly
              />
            </div>
            <div className="col-12 col-md-4">
              <span className="form-label d-block">Current Status</span>
              <div className="d-flex flex-wrap align-items-center gap-2">
                <span className={`tt-badge ${STATUS_BADGE_CLASS[ticket.currentStatus] ?? ''}`}>
                  {STATUS_LABEL[ticket.currentStatus] ?? ticket.currentStatus}
                </span>
                {/* ui-spec.md 5: once sent, the button is replaced by a tag; a Closed or Cancelled
                    Ticket has nothing left to signal (api-spec.md 3). */}
                {ticket.requesterConfirmedAt ? (
                  <span className="tt-badge tt-requester-confirmed">Requester confirmed</span>
                ) : ticket.currentStatus !== 'CLOSED' && ticket.currentStatus !== 'CANCELLED' ? (
                  <button
                    type="button"
                    className="btn btn-tt-secondary btn-sm"
                    disabled={signalBusy}
                    onClick={() => setConfirmingSignal(true)}
                  >
                    Problem Appears Resolved
                  </button>
                ) : null}
              </div>
            </div>
          </div>

          {signalFeedback && (
            <div
              className={`alert ${signalFeedback.tone === 'success' ? 'tt-alert-success' : 'tt-alert-error'} mb-3`}
              role={signalFeedback.tone === 'success' ? 'status' : 'alert'}
            >
              {signalFeedback.message}
            </div>
          )}

          {/* Classification block: Category, Related System, Requested Priority. */}
          <div className="row mb-3">
            <div className="col-12 col-md-4">
              <label htmlFor="category" className="form-label">
                Category
              </label>
              <input
                id="category"
                type="text"
                className="form-control tt-field-readonly"
                value={ticket.category?.name ?? '—'}
                readOnly
              />
            </div>
            <div className="col-12 col-md-4">
              <label htmlFor="relatedSystem" className="form-label">
                Related System
              </label>
              <input
                id="relatedSystem"
                type="text"
                className="form-control tt-field-readonly"
                value={ticket.relatedSystem?.name ?? '—'}
                readOnly
              />
            </div>
            <div className="col-12 col-md-4">
              <span className="form-label d-block">Requested Priority</span>
              <span
                className={`tt-badge tt-badge-priority-${ticket.requestedPriority.toLowerCase()}`}
              >
                {PRIORITY_LABEL[ticket.requestedPriority] ?? ticket.requestedPriority}
              </span>
            </div>
          </div>

          {/* Summary and Description, full width. */}
          <div className="mb-3">
            <label htmlFor="summary" className="form-label">
              Summary
            </label>
            <input
              id="summary"
              type="text"
              className="form-control tt-field-readonly"
              value={ticket.summary}
              readOnly
            />
          </div>

          <div className="mb-4">
            <label htmlFor="description" className="form-label">
              Description
            </label>
            <textarea
              id="description"
              className="form-control tt-field-readonly"
              value={ticket.description}
              readOnly
              rows={5}
            />
          </div>

          {/* ui-spec.md 14: the Attachment section sits behind its own heading and a visible
              divider (enforced inside AttachmentSection), so Ticket fields and attachment
              actions never visually merge. Issue #16: add and soft-remove live here now. */}
          <AttachmentSection
            ticketId={ticket.id}
            attachments={ticket.attachments}
            onAttachmentAdded={(attachment) =>
              setTicket((current) =>
                current ? { ...current, attachments: [...current.attachments, attachment] } : current,
              )
            }
            onAttachmentRemoved={(attachment) =>
              setTicket((current) =>
                current
                  ? {
                      ...current,
                      attachments: current.attachments.map((a) => (a.id === attachment.id ? attachment : a)),
                    }
                  : current,
              )
            }
          />

          {/* ui-spec.md 5: Public Comments below Attachments, with its own heading and divider. */}
          <section className="tt-requester-comments mt-4">
            <hr className="tt-attachment-divider" />
            <h2 className="h5 mb-3">Public Comments</h2>
            <ConversationPanel
              kind="comment"
              ticketId={ticket.id}
              entries={comments}
              loadFailed={commentsFailed}
              onPosted={(entry) => setComments((current) => [...(current ?? []), entry])}
            />
          </section>

          <div className="mt-4">
            <Link to="/my-tickets" className="btn btn-tt-secondary">
              Back to My Tickets
            </Link>
          </div>

          {confirmingSignal && (
            <div className="tt-confirm-backdrop">
              <div className="tt-confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="signal-confirm-title">
                <h2 id="signal-confirm-title" className="h5 mb-2">
                  Let IT Staff know this looks fixed?
                </h2>
                <p className="mb-3">This doesn't close the Ticket. IT Staff still confirm it is resolved.</p>
                <div className="d-flex justify-content-end gap-2">
                  <button type="button" className="btn btn-tt-tertiary" onClick={() => setConfirmingSignal(false)}>
                    Go back
                  </button>
                  <button type="button" className="btn btn-tt-primary" onClick={() => void sendResolutionSignal()}>
                    Yes, let them know
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
