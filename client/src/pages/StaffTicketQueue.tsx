import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { STATUS_BADGE_CLASS } from '../components/badge-classes';

interface QueueRow {
  id: number;
  ticketNumber: string;
  summary: string;
  requester: { id: number; name: string };
  currentStatus: string;
  itPriority: 'LOW' | 'MEDIUM' | 'HIGH';
  owner: { id: number; name: string } | null;
  createdAt: string;
}

interface QueuePage {
  data: QueueRow[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
}

// ui-spec.md 9: every badge shows its word, so state is never carried by color alone.
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

// ui-spec.md 6: the three api-spec.md 4 sort values, each ascending or descending.
const SORT_OPTIONS = [
  { value: 'createdAt', label: 'Created' },
  { value: 'itPriority', label: 'IT Priority' },
  { value: 'status', label: 'Status' },
];

// `assigned` is the control's value: '' (Anyone), 'me' or 'unassigned'. It becomes the API's
// `owner` only when the request is built, since "Me" means the signed-in user's own id.
const EMPTY_FILTERS = { status: '', itPriority: '', assigned: '' };

function formatAbsolute(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// ui-spec.md 6: Created shows a relative time, with the absolute date and time on hover.
function formatRelative(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  const relative = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  const minutes = Math.round((date.getTime() - Date.now()) / 60_000);
  if (Math.abs(minutes) < 60) return relative.format(minutes, 'minute');
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return relative.format(hours, 'hour');
  const days = Math.round(hours / 24);
  if (Math.abs(days) < 30) return relative.format(days, 'day');
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

// ui-spec.md 6/10: the IT Staff Ticket Queue - one table on desktop that becomes one card per
// Ticket below 992px (theme.css .tt-queue-table), with loading, empty, no-results and safe failure.
export function StaffTicketQueue() {
  const { user } = useAuth();
  const navigate = useNavigate();

  // The text in the box, and the term actually applied. Kept apart so typing doesn't fire a
  // request per keystroke; submitting the form promotes one to the other.
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [sort, setSort] = useState('createdAt');
  const [order, setOrder] = useState('asc');
  const [page, setPage] = useState(1);

  const [result, setResult] = useState<QueuePage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryToken, setRetryToken] = useState(0);

  // Guards against a slow earlier request overwriting a newer one's results.
  const requestSeq = useRef(0);

  useEffect(() => {
    if (!user) return;

    const seq = ++requestSeq.current;
    setLoading(true);
    setError(null);

    const params = new URLSearchParams({ sort, order, page: String(page) });
    if (search) params.set('search', search);
    if (filters.status) params.set('status', filters.status);
    if (filters.itPriority) params.set('itPriority', filters.itPriority);
    if (filters.assigned === 'me') params.set('owner', String(user.id));
    if (filters.assigned === 'unassigned') params.set('owner', 'unassigned');

    fetch(`/api/staff/tickets?${params.toString()}`, { credentials: 'include' })
      .then(async (response) => {
        const body = await response.json().catch(() => null);
        if (!response.ok || !body || !Array.isArray(body.data)) {
          throw new Error('Unexpected queue response');
        }
        return body as QueuePage;
      })
      .then((body) => {
        if (seq !== requestSeq.current) return;
        setResult(body);
        setLoading(false);
      })
      .catch(() => {
        if (seq !== requestSeq.current) return;
        // Safe message only, and never the empty state - that would tell IT Staff there is no
        // work when the server is simply unreachable.
        setError('Unable to load the queue right now.');
        setResult(null);
        setLoading(false);
      });
  }, [user, search, filters, sort, order, page, retryToken]);

  const hasActiveQuery = search !== '' || Object.values(filters).some((value) => value !== '');

  // Every change to what is searched, filtered or sorted resets the page in the same handler, so
  // it sends one request already on page 1 - not one with the old page and a second after.
  const handleSearchSubmit = (event: FormEvent) => {
    event.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
  };

  const handleFilterChange = (key: keyof typeof EMPTY_FILTERS) => (event: ChangeEvent<HTMLSelectElement>) => {
    const { value } = event.target;
    setPage(1);
    setFilters((current) => ({ ...current, [key]: value }));
  };

  const handleClearFilters = () => {
    setPage(1);
    setSearchInput('');
    setSearch('');
    setFilters(EMPTY_FILTERS);
  };

  const totalPages = result?.totalPages ?? 0;
  const showEmptyState = !loading && result !== null && result.totalCount === 0 && !hasActiveQuery;
  // Clear filters is rendered once: in the no-results message while that is on screen, and in
  // the controls the rest of the time (same reasoning as My Tickets).
  const showNoResults = !loading && result !== null && result.totalCount === 0 && hasActiveQuery;

  return (
    <section className="tt-staff-queue">
      <h1 className="h4 mb-3">My Queue</h1>

      {error && (
        <div className="alert tt-alert-error" role="alert">
          <p className="mb-2">{error}</p>
          <button type="button" className="btn btn-tt-secondary btn-sm" onClick={() => setRetryToken((token) => token + 1)}>
            Try again
          </button>
        </div>
      )}

      {!error && (
        <>
          {!showEmptyState && (
            <div className="tt-list-controls mb-3">
              <form className="row g-2 align-items-end mb-2" onSubmit={handleSearchSubmit}>
                <div className="col-12 col-md-6 col-lg-5">
                  <label htmlFor="queue-search" className="form-label">
                    Search
                  </label>
                  <input
                    id="queue-search"
                    type="search"
                    className="form-control tt-field"
                    placeholder="Ticket #, summary, description or requester"
                    value={searchInput}
                    onChange={(event) => setSearchInput(event.target.value)}
                  />
                </div>
                <div className="col-auto">
                  <button type="submit" className="btn btn-tt-secondary">
                    Search
                  </button>
                </div>
                {hasActiveQuery && !showNoResults && (
                  <div className="col-auto">
                    <button type="button" className="btn btn-tt-tertiary" onClick={handleClearFilters}>
                      Clear filters
                    </button>
                  </div>
                )}
              </form>

              <div className="row g-2">
                <div className="col-12 col-md-4 col-lg-2">
                  <label htmlFor="queue-status" className="form-label">
                    Status
                  </label>
                  <select id="queue-status" className="form-select tt-field" value={filters.status} onChange={handleFilterChange('status')}>
                    <option value="">All statuses</option>
                    {Object.entries(STATUS_LABEL).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="col-12 col-md-4 col-lg-2">
                  <label htmlFor="queue-it-priority" className="form-label">
                    IT Priority
                  </label>
                  <select id="queue-it-priority" className="form-select tt-field" value={filters.itPriority} onChange={handleFilterChange('itPriority')}>
                    <option value="">All priorities</option>
                    <option value="LOW">Low</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="HIGH">High</option>
                  </select>
                </div>

                <div className="col-12 col-md-4 col-lg-2">
                  <label htmlFor="queue-assigned" className="form-label">
                    Assigned
                  </label>
                  <select id="queue-assigned" className="form-select tt-field" value={filters.assigned} onChange={handleFilterChange('assigned')}>
                    <option value="">Anyone</option>
                    <option value="me">Me</option>
                    <option value="unassigned">Unassigned</option>
                  </select>
                </div>

                <div className="col-12 col-md-6 col-lg-3">
                  <label htmlFor="queue-sort" className="form-label">
                    Sort by
                  </label>
                  <select
                    id="queue-sort"
                    className="form-select tt-field"
                    value={sort}
                    onChange={(event) => {
                      setPage(1);
                      setSort(event.target.value);
                    }}
                  >
                    {SORT_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="col-12 col-md-6 col-lg-3">
                  <label htmlFor="queue-order" className="form-label">
                    Order
                  </label>
                  <select
                    id="queue-order"
                    className="form-select tt-field"
                    value={order}
                    onChange={(event) => {
                      setPage(1);
                      setOrder(event.target.value);
                    }}
                  >
                    <option value="asc">Ascending</option>
                    <option value="desc">Descending</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {loading && (
            <div className="tt-skeleton-list" aria-busy="true">
              <span className="visually-hidden">Loading the queue…</span>
              {[0, 1, 2, 3, 4].map((placeholder) => (
                <div key={placeholder} className="tt-skeleton-row" />
              ))}
            </div>
          )}

          {showEmptyState && (
            <div className="tt-empty-state text-center py-5">
              <p className="tt-empty-state__icon mb-3" aria-hidden="true">
                📭
              </p>
              <p className="mb-0">No tickets in the queue.</p>
            </div>
          )}

          {showNoResults && (
            <div className="tt-no-results py-4">
              <p className="mb-2">No tickets match your search or filters.</p>
              <button type="button" className="btn btn-tt-tertiary px-0" onClick={handleClearFilters}>
                Clear filters
              </button>
            </div>
          )}

          {!loading && result && result.totalCount > 0 && (
            <>
              <table className="table tt-queue-table align-middle">
                <thead>
                  <tr>
                    <th scope="col" className="tt-queue-head-number">Ticket #</th>
                    <th scope="col">Summary</th>
                    <th scope="col" className="tt-queue-head-requester">Requester</th>
                    <th scope="col" className="tt-queue-head-status">Status</th>
                    <th scope="col" className="tt-queue-head-priority">IT Priority</th>
                    <th scope="col" className="tt-queue-head-owner">Assigned To</th>
                    <th scope="col" className="tt-queue-head-created">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {result.data.map((item) => (
                    // ui-spec.md 6: the whole row (or card) opens Ticket Detail. The Ticket # link
                    // is the keyboard- and screen-reader path to the same place.
                    <tr key={item.id} className="tt-queue-row" onClick={() => navigate(`/staff/tickets/${item.id}`)}>
                      <td className="tt-queue-number">
                        <Link to={`/staff/tickets/${item.id}`} onClick={(event) => event.stopPropagation()}>
                          {item.ticketNumber}
                        </Link>
                      </td>
                      <td className="tt-queue-summary">{item.summary}</td>
                      <td className="tt-queue-requester">{item.requester.name}</td>
                      <td className="tt-queue-status">
                        <span className={`tt-badge ${STATUS_BADGE_CLASS[item.currentStatus] ?? ''}`}>
                          {STATUS_LABEL[item.currentStatus] ?? item.currentStatus}
                        </span>
                      </td>
                      <td className="tt-queue-priority">
                        <span className={`tt-badge tt-badge-priority-${item.itPriority.toLowerCase()}`}>
                          {PRIORITY_LABEL[item.itPriority] ?? item.itPriority}
                        </span>
                      </td>
                      <td className="tt-queue-owner" data-label="Assigned To">
                        {item.owner ? item.owner.name : <span className="tt-queue-unassigned">Unassigned</span>}
                      </td>
                      <td className="tt-queue-created" data-label="Created">
                        <time dateTime={item.createdAt} title={formatAbsolute(item.createdAt)}>
                          {formatRelative(item.createdAt)}
                        </time>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {totalPages > 1 && (
                <nav className="tt-pagination d-flex justify-content-center align-items-center gap-2 mt-3" aria-label="Queue pages">
                  <button
                    type="button"
                    className="btn btn-tt-secondary btn-sm"
                    onClick={() => setPage((current) => Math.max(1, current - 1))}
                    disabled={result.page <= 1}
                  >
                    Previous
                  </button>
                  {Array.from({ length: totalPages }, (_, index) => index + 1).map((pageNumber) => (
                    <button
                      key={pageNumber}
                      type="button"
                      className={`btn btn-sm ${pageNumber === result.page ? 'btn-tt-primary' : 'btn-tt-tertiary'}`}
                      aria-current={pageNumber === result.page ? 'page' : undefined}
                      onClick={() => setPage(pageNumber)}
                    >
                      {pageNumber}
                    </button>
                  ))}
                  <button
                    type="button"
                    className="btn btn-tt-secondary btn-sm"
                    onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                    disabled={result.page >= totalPages}
                  >
                    Next
                  </button>
                </nav>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}
