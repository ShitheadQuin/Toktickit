import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ACTION_STATUS_BADGE_CLASS, STATUS_BADGE_CLASS } from '../components/badge-classes';

// docs/lab-04/ui-spec.md 3 to 5: one /dashboard route that renders the dashboard for the signed-in
// role. Every figure and link comes from the server (BR-23); this screen only lays them out, and
// never repeats the full My Tickets or Queue screens.

interface Metric {
  key: string;
  label: string;
  count: number;
  link: string | null;
}

interface TicketSummary {
  id: number;
  ticketNumber: string;
  summary: string;
  currentStatus: string;
  updatedAt: string;
}

interface RequesterData {
  metrics: Metric[];
  recentTickets: TicketSummary[];
  recentlyResolved: TicketSummary[];
}

interface StaffData {
  metrics: Metric[];
  byStatus: { status: string; count: number; link: string }[];
  byItPriority: { itPriority: string; count: number; link: string }[];
  myOpenActions: { id: number; ticketId: number; ticketNumber: string; description: string; status: string; actionAt: string }[];
  recentTickets: TicketSummary[];
  userCounts?: { requester: number; itStaff: number; administrator: number; inactive: number; link: string };
}

type Load<T> = { state: 'loading' } | { state: 'ready'; data: T } | { state: 'forbidden' } | { state: 'error' };

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
const PRIORITY_LABEL: Record<string, string> = { LOW: 'Low', MEDIUM: 'Medium', HIGH: 'High' };
const ACTION_STATUS_LABEL: Record<string, string> = { PLANNED: 'Planned', IN_PROGRESS: 'In Progress', COMPLETED: 'Completed', CANCELLED: 'Cancelled' };

// Stored in UTC, shown in Asia/Bangkok time (specification.md BR-24).
function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('en-GB', { timeZone: 'Asia/Bangkok', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function useDashboard<T>(url: string) {
  const [load, setLoad] = useState<Load<T>>({ state: 'loading' });
  const [token, setToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoad({ state: 'loading' });
    fetch(url, { credentials: 'include' })
      .then(async (response) => {
        if (cancelled) return;
        if (response.status === 403) return setLoad({ state: 'forbidden' });
        const body = response.ok ? await response.json().catch(() => null) : null;
        if (cancelled) return;
        setLoad(body && Array.isArray(body.metrics) ? { state: 'ready', data: body as T } : { state: 'error' });
      })
      .catch(() => {
        if (!cancelled) setLoad({ state: 'error' });
      });
    return () => {
      cancelled = true;
    };
  }, [url, token]);

  return { load, reload: () => setToken((t) => t + 1) };
}

export function Dashboard() {
  const { user } = useAuth();
  if (!user) return null;
  return user.role === 'REQUESTER' ? <RequesterDashboard firstName={user.name.split(' ')[0]!} /> : <StaffDashboard firstName={user.name.split(' ')[0]!} />;
}

function Header({ firstName, subtitle, onRefresh, busy }: { firstName: string; subtitle: string; onRefresh: () => void; busy: boolean }) {
  return (
    <div className="d-flex flex-wrap align-items-start justify-content-between gap-2 mb-3">
      <div>
        <h1 className="h4 mb-1">Welcome, {firstName}</h1>
        <p className="text-muted mb-0">{subtitle}</p>
      </div>
      <button type="button" className="btn btn-tt-secondary btn-sm" onClick={onRefresh} disabled={busy}>
        {busy ? 'Refreshing…' : 'Refresh'}
      </button>
    </div>
  );
}

function StateMessage<T>({ load, onRetry }: { load: Load<T>; onRetry: () => void }) {
  if (load.state === 'loading') {
    return (
      <div className="tt-skeleton-list" aria-busy="true">
        <span className="visually-hidden">Loading the dashboard…</span>
        {[0, 1, 2].map((row) => (
          <div key={row} className="tt-skeleton-row" />
        ))}
      </div>
    );
  }
  if (load.state === 'forbidden') {
    return (
      <div className="alert tt-alert-error">
        <p className="mb-2">You do not have access to this page.</p>
        <Link to="/" className="btn btn-tt-secondary btn-sm">
          Go to your start page
        </Link>
      </div>
    );
  }
  if (load.state === 'error') {
    return (
      <div className="alert tt-alert-error d-flex flex-wrap align-items-center gap-2" role="alert">
        <span>The dashboard could not be loaded. Try again.</span>
        <button type="button" className="btn btn-tt-secondary btn-sm" onClick={onRetry}>
          Retry
        </button>
      </div>
    );
  }
  return null;
}

// ui-spec.md 3: label, large number, and "View" to the drill-down; the whole card is one link with a
// spoken name that carries the number. A card without a drill-down is not a link.
function MetricCard({ metric, attention }: { metric: Metric; attention?: string }) {
  const body = (
    <>
      <span className="tt-metric-label">{metric.label}</span>
      <span className="tt-metric-count">{metric.count}</span>
      {attention && metric.count > 0 && <span className="tt-metric-attention">{attention}</span>}
      {metric.link && <span className="tt-metric-view">View</span>}
    </>
  );
  const className = `tt-metric-card${attention && metric.count > 0 ? ' tt-metric-card-attention' : ''}`;
  return metric.link ? (
    <Link to={metric.link} className={className} aria-label={`${metric.label}: ${metric.count}, view list`}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}

function TicketList({ id, title, tickets, empty, detailPath, viewAll }: { id: string; title: string; tickets: TicketSummary[]; empty: string; detailPath: string; viewAll?: string }) {
  return (
    <section className="tt-dashboard-panel" aria-labelledby={id}>
      <div className="d-flex align-items-baseline justify-content-between gap-2 mb-2">
        <h2 id={id} className="h6 mb-0">
          {title}
        </h2>
        {viewAll && (
          <Link to={viewAll} className="tt-conversation-meta">
            View all
          </Link>
        )}
      </div>
      {tickets.length === 0 ? (
        <p className="text-muted mb-0">{empty}</p>
      ) : (
        <ul className="list-unstyled mb-0 tt-dashboard-list">
          {tickets.map((ticket) => (
            <li key={ticket.id}>
              <div className="tt-dashboard-list-main">
                <Link to={`${detailPath}/${ticket.id}`} className="fw-semibold">
                  {ticket.ticketNumber}
                </Link>
                <span className="tt-dashboard-summary">{ticket.summary}</span>
              </div>
              <div className="tt-dashboard-list-meta">
                <span className={`tt-badge ${STATUS_BADGE_CLASS[ticket.currentStatus] ?? ''}`}>{STATUS_LABEL[ticket.currentStatus] ?? ticket.currentStatus}</span>
                <span className="tt-conversation-meta">{formatDateTime(ticket.updatedAt)}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function RequesterDashboard({ firstName }: { firstName: string }) {
  const { load, reload } = useDashboard<RequesterData>('/api/dashboard/requester');
  return (
    <section className="tt-dashboard">
      <Header firstName={firstName} subtitle="Here is the latest on your requests." onRefresh={reload} busy={load.state === 'loading'} />
      <StateMessage load={load} onRetry={reload} />
      {load.state === 'ready' && (
        <>
          <div className="tt-metric-grid mb-3">
            {load.data.metrics.map((metric) => (
              <MetricCard key={metric.key} metric={metric} attention={metric.key === 'waitingForMe' ? 'Needs your reply' : undefined} />
            ))}
          </div>
          <div className="tt-dashboard-columns">
            <TicketList id="dash-recent" title="My Recent Tickets" tickets={load.data.recentTickets} empty="You have no Tickets yet." detailPath="/tickets" viewAll="/my-tickets" />
            <div className="tt-dashboard-side">
              <TicketList id="dash-resolved" title="Recently Resolved" tickets={load.data.recentlyResolved} empty="Nothing resolved in the last 7 days." detailPath="/tickets" />
              <section className="tt-dashboard-panel" aria-labelledby="dash-quick">
                <h2 id="dash-quick" className="h6 mb-2">
                  Quick Actions
                </h2>
                <div className="d-flex flex-wrap gap-2">
                  <Link to="/create-ticket" className="btn btn-tt-primary btn-sm">
                    Create Ticket
                  </Link>
                  <Link to="/my-tickets" className="btn btn-tt-secondary btn-sm">
                    View My Tickets
                  </Link>
                </div>
              </section>
            </div>
          </div>
        </>
      )}
    </section>
  );
}

function StaffDashboard({ firstName }: { firstName: string }) {
  const { load, reload } = useDashboard<StaffData>('/api/dashboard/staff');
  return (
    <section className="tt-dashboard">
      <Header firstName={firstName} subtitle="Here is what is happening in the queue." onRefresh={reload} busy={load.state === 'loading'} />
      <StateMessage load={load} onRetry={reload} />
      {load.state === 'ready' && (
        <>
          <div className="tt-metric-grid mb-3">
            {load.data.metrics.map((metric) => (
              <MetricCard key={metric.key} metric={metric} />
            ))}
          </div>
          <div className="tt-dashboard-columns">
            <div className="tt-dashboard-main">
              <TicketList id="dash-recent" title="Recent Tickets" tickets={load.data.recentTickets} empty="There are no Tickets yet." detailPath="/staff/tickets" viewAll="/staff/queue" />
              <section className="tt-dashboard-panel" aria-labelledby="dash-actions">
                <h2 id="dash-actions" className="h6 mb-2">
                  My Open Actions
                </h2>
                {load.data.myOpenActions.length === 0 ? (
                  <p className="text-muted mb-0">No open Actions are assigned to you.</p>
                ) : (
                  <ul className="list-unstyled mb-0 tt-dashboard-list">
                    {load.data.myOpenActions.map((action) => (
                      <li key={action.id}>
                        <div className="tt-dashboard-list-main">
                          <span>{action.description}</span>
                          <Link to={`/staff/tickets/${action.ticketId}`} className="tt-conversation-meta">
                            {action.ticketNumber}
                          </Link>
                        </div>
                        <div className="tt-dashboard-list-meta">
                          <span className={`tt-badge ${ACTION_STATUS_BADGE_CLASS[action.status] ?? ''}`}>{ACTION_STATUS_LABEL[action.status] ?? action.status}</span>
                          <span className="tt-conversation-meta">{formatDateTime(action.actionAt)}</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
            <div className="tt-dashboard-side">
              <section className="tt-dashboard-panel" aria-labelledby="dash-by-status">
                <h2 id="dash-by-status" className="h6 mb-2">
                  By Status
                </h2>
                <ul className="list-unstyled mb-0 tt-breakdown-list">
                  {load.data.byStatus.map((row) => (
                    <li key={row.status}>
                      <Link to={row.link} aria-label={`${STATUS_LABEL[row.status] ?? row.status}: ${row.count}, view list`}>
                        <span className={`tt-badge ${STATUS_BADGE_CLASS[row.status] ?? ''}`}>{STATUS_LABEL[row.status] ?? row.status}</span>
                        <span className="tt-breakdown-count">{row.count}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
              <section className="tt-dashboard-panel" aria-labelledby="dash-by-priority">
                <h2 id="dash-by-priority" className="h6 mb-2">
                  By IT Priority <span className="tt-conversation-meta">(active Tickets)</span>
                </h2>
                <ul className="list-unstyled mb-0 tt-breakdown-list">
                  {load.data.byItPriority.map((row) => (
                    <li key={row.itPriority}>
                      <Link to={row.link} aria-label={`${PRIORITY_LABEL[row.itPriority] ?? row.itPriority}: ${row.count}, view list`}>
                        <span className={`tt-badge tt-badge-priority-${row.itPriority.toLowerCase()}`}>{PRIORITY_LABEL[row.itPriority] ?? row.itPriority}</span>
                        <span className="tt-breakdown-count">{row.count}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
              {load.data.userCounts && (
                <section className="tt-dashboard-panel" aria-labelledby="dash-users">
                  <h2 id="dash-users" className="h6 mb-2">
                    User Accounts
                  </h2>
                  <dl className="tt-user-counts mb-2">
                    <dt>Requesters</dt>
                    <dd>{load.data.userCounts.requester}</dd>
                    <dt>IT Staff</dt>
                    <dd>{load.data.userCounts.itStaff}</dd>
                    <dt>Administrators</dt>
                    <dd>{load.data.userCounts.administrator}</dd>
                    <dt>Inactive</dt>
                    <dd>{load.data.userCounts.inactive}</dd>
                  </dl>
                  <Link to={load.data.userCounts.link} className="btn btn-tt-secondary btn-sm">
                    Manage users
                  </Link>
                </section>
              )}
              <section className="tt-dashboard-panel" aria-labelledby="dash-quick">
                <h2 id="dash-quick" className="h6 mb-2">
                  Quick Actions
                </h2>
                <Link to="/staff/queue" className="btn btn-tt-primary btn-sm">
                  Open Ticket Queue
                </Link>
              </section>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
