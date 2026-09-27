import { useEffect, useState } from 'react';

// docs/lab-04/ui-spec.md 9: the append-only status history (BR-18), oldest first, read-only. Shown
// on both Staff and Requester Ticket Detail. refreshToken lets the page reload it after a change.

interface HistoryRow {
  id: number;
  fromStatus: string;
  toStatus: string;
  changedAt: string;
  changedBy: { id: number; name: string };
}

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

// Stored in UTC, shown in Asia/Bangkok time (specification.md BR-24).
function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('en-GB', { timeZone: 'Asia/Bangkok', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function StatusHistory({ ticketId, refreshToken }: { ticketId: number; refreshToken: number }) {
  const [rows, setRows] = useState<HistoryRow[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    fetch(`/api/tickets/${ticketId}/history`, { credentials: 'include' })
      .then(async (response) => {
        if (!response.ok) throw new Error(String(response.status));
        const body = await response.json();
        if (!cancelled) setRows(Array.isArray(body) ? (body as HistoryRow[]) : []);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [ticketId, refreshToken]);

  return (
    <section className="tt-status-history mb-4" aria-labelledby="status-history-heading">
      <h2 id="status-history-heading" className="h6 mb-2">
        Status History
      </h2>
      {failed && <p className="text-muted mb-0">Status history could not be loaded right now.</p>}
      {!failed && rows === null && <p className="text-muted mb-0">Loading status history…</p>}
      {rows && rows.length === 0 && <p className="text-muted mb-0">No status changes recorded since Lab 4.</p>}
      {rows && rows.length > 0 && (
        <ol className="tt-status-history-list mb-0">
          {rows.map((row) => (
            <li key={row.id}>
              <span className="fw-semibold">
                {STATUS_LABEL[row.fromStatus] ?? row.fromStatus} → {STATUS_LABEL[row.toStatus] ?? row.toStatus}
              </span>
              <span className="tt-conversation-meta">
                {' '}
                by {row.changedBy.name}, {formatDateTime(row.changedAt)}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
