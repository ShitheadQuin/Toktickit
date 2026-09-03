import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useRequester } from '../context/RequesterContext';
import { AttachmentSection, type Attachment } from '../components/AttachmentSection';

interface ReferenceItem {
  id: number;
  name: string;
}

interface TicketDetail {
  id: number;
  ticketNumber: string;
  ticketDate: string;
  updatedAt: string;
  summary: string;
  description: string;
  requestedPriority: 'LOW' | 'MEDIUM' | 'HIGH';
  currentStatus: 'NEW';
  category: ReferenceItem;
  relatedSystem: ReferenceItem;
  attachments: Attachment[];
}

// ui-spec.md 12: every badge shows its word, so state is never carried by color alone.
const PRIORITY_LABEL: Record<string, string> = { LOW: 'Low', MEDIUM: 'Medium', HIGH: 'High' };
const STATUS_LABEL: Record<string, string> = { NEW: 'New' };

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

type Status = 'loading' | 'success' | 'not-found' | 'forbidden' | 'error';

// ui-spec.md 14: Requester Ticket Detail, read-only. AC-21: full detail for an owned Ticket.
// BR-22: ownership is enforced server-side (app.ts); this screen only renders whatever the
// backend already decided the caller may see, and never partial data on a 403/404 (UI-13).
export function RequesterTicketDetail() {
  const { id } = useParams();
  const { requester } = useRequester();

  const [status, setStatus] = useState<Status>('loading');
  const [ticket, setTicket] = useState<TicketDetail | null>(null);
  const [retryToken, setRetryToken] = useState(0);

  useEffect(() => {
    if (!requester) return;

    let cancelled = false;
    setStatus('loading');
    setTicket(null);

    fetch(`/api/tickets/${id}`, {
      headers: { 'X-Requester-Id': String(requester.id) },
    })
      .then(async (response) => {
        if (cancelled) return;
        if (response.status === 404) {
          setStatus('not-found');
          return;
        }
        if (response.status === 403) {
          setStatus('forbidden');
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
  }, [id, requester, retryToken]);

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

      {status === 'forbidden' && (
        <div className="alert tt-alert-error" role="alert">
          <p className="mb-2">You don't have access to this Ticket.</p>
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
              <span className={`tt-badge tt-badge-status-${ticket.currentStatus.toLowerCase()}`}>
                {STATUS_LABEL[ticket.currentStatus] ?? ticket.currentStatus}
              </span>
            </div>
          </div>

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

          <div className="mt-4">
            <Link to="/my-tickets" className="btn btn-tt-secondary">
              Back to My Tickets
            </Link>
          </div>
        </>
      )}
    </section>
  );
}
