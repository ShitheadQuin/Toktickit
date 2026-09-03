import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useRequester } from '../context/RequesterContext';

interface ReferenceItem {
  id: number;
  name: string;
}

interface TicketListItem {
  id: number;
  ticketNumber: string;
  summary: string;
  ticketDate: string;
  updatedAt: string;
  requestedPriority: 'LOW' | 'MEDIUM' | 'HIGH';
  currentStatus: 'NEW';
  category: ReferenceItem;
}

interface TicketListPage {
  data: TicketListItem[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

// ui-spec.md 11: the five sort fields api-spec.md 4 permits. Every permitted API sort value is
// reachable from the UI - a sort the user cannot select would have no user path.
const SORT_OPTIONS = [
  { value: 'ticketDate', label: 'Ticket Date' },
  { value: 'updatedAt', label: 'Last Updated' },
  { value: 'ticketNumber', label: 'Ticket Number' },
  { value: 'requestedPriority', label: 'Requested Priority' },
  { value: 'currentStatus', label: 'Current Status' },
];

// ui-spec.md 12: every badge shows its word, so state is never carried by color alone.
const PRIORITY_LABEL: Record<string, string> = { LOW: 'Low', MEDIUM: 'Medium', HIGH: 'High' };
const STATUS_LABEL: Record<string, string> = { NEW: 'New' };

const EMPTY_FILTERS = { category: '', relatedSystem: '', currentStatus: '', requestedPriority: '' };

// ui-spec.md 11: page size is not a user control in Lab 2 - the frontend always asks for the
// api-spec.md 4 default. The other permitted sizes exist for the API and its tests.
const PAGE_SIZE = '10';

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function MyTickets() {
  const { requester } = useRequester();

  // The text in the box, and the term actually applied. Kept apart so typing does not fire a
  // request per keystroke; the form submit promotes one to the other.
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [sort, setSort] = useState('ticketDate');
  const [order, setOrder] = useState('desc');
  const [page, setPage] = useState(1);

  const [result, setResult] = useState<TicketListPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryToken, setRetryToken] = useState(0);

  const [categories, setCategories] = useState<ReferenceItem[]>([]);
  const [relatedSystems, setRelatedSystems] = useState<ReferenceItem[]>([]);

  // Guards against a slow earlier request overwriting a newer one's results.
  const requestSeq = useRef(0);

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      fetch('/api/categories').then((response) => (response.ok ? response.json() : [])),
      fetch('/api/related-systems').then((response) => (response.ok ? response.json() : [])),
    ])
      .then(([loadedCategories, loadedSystems]) => {
        if (cancelled) return;
        setCategories(Array.isArray(loadedCategories) ? loadedCategories : []);
        setRelatedSystems(Array.isArray(loadedSystems) ? loadedSystems : []);
      })
      .catch(() => {
        // Reference data only populates the filter dropdowns. If it fails the list itself still
        // works, so this must not become the screen's error state.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!requester) return;

    const seq = ++requestSeq.current;
    setLoading(true);
    setError(null);

    const params = new URLSearchParams({ sort, order, page: String(page), pageSize: PAGE_SIZE });
    if (search) params.set('search', search);
    if (filters.category) params.set('category', filters.category);
    if (filters.relatedSystem) params.set('relatedSystem', filters.relatedSystem);
    if (filters.currentStatus) params.set('currentStatus', filters.currentStatus);
    if (filters.requestedPriority) params.set('requestedPriority', filters.requestedPriority);

    fetch(`/api/tickets?${params.toString()}`, {
      // api-spec.md 1: the current Requester travels in the header, and the backend - not this
      // component - decides what belongs to them (BR-08).
      headers: { 'X-Requester-Id': String(requester.id) },
    })
      .then(async (response) => {
        const body = await response.json().catch(() => null);
        if (!response.ok || !body || !Array.isArray(body.data)) {
          throw new Error('Unexpected ticket list response');
        }
        return body as TicketListPage;
      })
      .then((body) => {
        if (seq !== requestSeq.current) return;
        setResult(body);
        setLoading(false);
      })
      .catch(() => {
        if (seq !== requestSeq.current) return;
        // Safe message only - never the server's raw error, and never the empty state, which
        // would tell the Requester their tickets are gone when the server is simply unreachable.
        setError('Unable to load your tickets right now.');
        setResult(null);
        setLoading(false);
      });
  }, [requester, search, filters, sort, order, page, retryToken]);

  const hasActiveQuery =
    search !== '' || Object.values(filters).some((value) => value !== '');

  // Any change to what is being searched, filtered or sorted returns to page 1. Without this,
  // narrowing the results while on page 3 lands on an empty page 3 - which looks exactly like
  // the no-results state but is not one.
  const handleSearchSubmit = (event: FormEvent) => {
    event.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
  };

  const handleFilterChange =
    (key: keyof typeof EMPTY_FILTERS) => (event: ChangeEvent<HTMLSelectElement>) => {
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
  const showEmptyState = !loading && result !== null && result.totalItems === 0 && !hasActiveQuery;
  // ui-spec.md 11 asks for Clear filters whenever a search or filter is active; 13 asks for one
  // in the no-results message. It is the same action, so it is rendered once - in the message
  // block while that state is on screen, and in the controls row the rest of the time. Two
  // identical buttons would leave the user guessing whether they do different things.
  const showNoResults = !loading && result !== null && result.totalItems === 0 && hasActiveQuery;

  return (
    <section className="tt-my-tickets">
      <h1 className="h4 mb-3">My Tickets</h1>

      {error && (
        <div className="alert tt-alert-error" role="alert">
          <p className="mb-2">{error}</p>
          <button
            type="button"
            className="btn btn-tt-secondary btn-sm"
            onClick={() => setRetryToken((token) => token + 1)}
          >
            Try again
          </button>
        </div>
      )}

      {!error && (
        <>
          {/* The controls are hidden only for the true empty state (ui-spec.md 13): a Requester
              with no Tickets at all has nothing to search or filter. */}
          {!showEmptyState && (
            <div className="tt-list-controls mb-3">
              <form className="row g-2 align-items-end mb-2" onSubmit={handleSearchSubmit}>
                <div className="col-12 col-md-6 col-lg-4">
                  <label htmlFor="search" className="form-label">
                    Search
                  </label>
                  <input
                    id="search"
                    type="search"
                    className="form-control tt-field"
                    placeholder="Ticket Number or Summary"
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
                <div className="col-12 col-md-6 col-lg-3">
                  <label htmlFor="filter-category" className="form-label">
                    Category
                  </label>
                  <select
                    id="filter-category"
                    className="form-select tt-field"
                    value={filters.category}
                    onChange={handleFilterChange('category')}
                  >
                    <option value="">All categories</option>
                    {categories.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="col-12 col-md-6 col-lg-3">
                  <label htmlFor="filter-related-system" className="form-label">
                    Related System
                  </label>
                  <select
                    id="filter-related-system"
                    className="form-select tt-field"
                    value={filters.relatedSystem}
                    onChange={handleFilterChange('relatedSystem')}
                  >
                    <option value="">All related systems</option>
                    {relatedSystems.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="col-12 col-md-6 col-lg-3">
                  <label htmlFor="filter-status" className="form-label">
                    Current Status
                  </label>
                  <select
                    id="filter-status"
                    className="form-select tt-field"
                    value={filters.currentStatus}
                    onChange={handleFilterChange('currentStatus')}
                  >
                    <option value="">All statuses</option>
                    <option value="NEW">New</option>
                  </select>
                </div>

                <div className="col-12 col-md-6 col-lg-3">
                  <label htmlFor="filter-priority" className="form-label">
                    Requested Priority
                  </label>
                  <select
                    id="filter-priority"
                    className="form-select tt-field"
                    value={filters.requestedPriority}
                    onChange={handleFilterChange('requestedPriority')}
                  >
                    <option value="">All priorities</option>
                    <option value="LOW">Low</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="HIGH">High</option>
                  </select>
                </div>

                <div className="col-12 col-md-6 col-lg-3">
                  <label htmlFor="sort-by" className="form-label">
                    Sort by
                  </label>
                  <select
                    id="sort-by"
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
                  <label htmlFor="sort-order" className="form-label">
                    Order
                  </label>
                  <select
                    id="sort-order"
                    className="form-select tt-field"
                    value={order}
                    onChange={(event) => {
                      setPage(1);
                      setOrder(event.target.value);
                    }}
                  >
                    <option value="desc">Descending</option>
                    <option value="asc">Ascending</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {loading && (
            <div className="tt-skeleton-list" aria-busy="true">
              <span className="visually-hidden">Loading your tickets…</span>
              {[0, 1, 2, 3, 4].map((row) => (
                <div key={row} className="tt-skeleton-row" />
              ))}
            </div>
          )}

          {showEmptyState && (
            <div className="tt-empty-state text-center py-5">
              <p className="tt-empty-state__icon mb-3" aria-hidden="true">
                🗂️
              </p>
              <p className="mb-3">You haven't created any tickets yet.</p>
              <Link to="/create-ticket" className="btn btn-tt-primary">
                Create Ticket
              </Link>
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

          {!loading && result && result.totalItems > 0 && (
            <>
              <div className="table-responsive">
                <table className="table tt-ticket-table align-middle">
                  <thead>
                    <tr>
                      <th scope="col" className="tt-head-number">Ticket Number</th>
                      <th scope="col" className="tt-head-summary">Summary</th>
                      <th scope="col" className="tt-head-category">Category</th>
                      <th scope="col" className="tt-head-priority">Requested Priority</th>
                      <th scope="col" className="tt-head-status">Current Status</th>
                      <th scope="col" className="tt-head-date">Ticket Date</th>
                      <th scope="col" className="tt-head-updated">Last Updated</th>
                      <th scope="col" className="tt-head-action">
                        <span className="visually-hidden">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.data.map((item) => (
                      <tr key={item.id}>
                        <td className="tt-col-number">{item.ticketNumber}</td>
                        <td className="tt-col-summary">{item.summary}</td>
                        <td className="tt-col-category">{item.category?.name ?? '—'}</td>
                        <td className="tt-col-priority">
                          <span
                            className={`tt-badge tt-badge-priority-${item.requestedPriority.toLowerCase()}`}
                          >
                            {PRIORITY_LABEL[item.requestedPriority] ?? item.requestedPriority}
                          </span>
                        </td>
                        <td className="tt-col-status">
                          <span className={`tt-badge tt-badge-status-${item.currentStatus.toLowerCase()}`}>
                            {STATUS_LABEL[item.currentStatus] ?? item.currentStatus}
                          </span>
                        </td>
                        <td className="tt-col-date" data-label="Ticket Date">
                          {formatDate(item.ticketDate)}
                        </td>
                        <td className="tt-col-updated" data-label="Last updated">
                          {formatDateTime(item.updatedAt)}
                        </td>
                        <td className="tt-col-action">
                          <Link to={`/tickets/${item.id}`} className="btn btn-tt-secondary btn-sm">
                            Open
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {totalPages > 1 && (
                <nav className="tt-pagination d-flex justify-content-center align-items-center gap-2 mt-3" aria-label="Ticket list pages">
                  <button
                    type="button"
                    className="btn btn-tt-secondary btn-sm"
                    onClick={() => setPage((current) => Math.max(1, current - 1))}
                    disabled={result.page <= 1}
                  >
                    Previous
                  </button>
                  {Array.from({ length: totalPages }, (unused, index) => index + 1).map((pageNumber) => (
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
