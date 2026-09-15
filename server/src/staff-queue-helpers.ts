// Pure helpers for the IT Staff Ticket Queue query (docs/lab-03/api-spec.md 4).
// Same split as ticket-list-helpers.ts, so UNIT-03 can test the normalization with no request,
// clock or database - and it reuses that file's parsing primitives rather than copying them.
import {
  CURRENT_STATUSES,
  REQUESTED_PRIORITIES,
  enumFilter,
  firstValue,
  parsePositiveInt,
  type CurrentStatusValue,
  type Filter,
  type RequestedPriorityValue,
  type TicketListOrder,
} from './ticket-list-helpers';

export const STAFF_QUEUE_SORTS = ['createdAt', 'itPriority', 'status'] as const;
export type StaffQueueSort = (typeof STAFF_QUEUE_SORTS)[number];

// api-spec.md 9: fixed, not client-selectable.
export const STAFF_QUEUE_PAGE_SIZE = 20;

export interface StaffQueueQuery {
  search?: string;
  status?: CurrentStatusValue;
  itPriority?: RequestedPriorityValue;
  owner?: number | 'unassigned';
  sort: StaffQueueSort;
  order: TicketListOrder;
  page: number;
  pageSize: number;
  /**
   * True when a filter carried a value no Ticket can hold. api-spec.md 4: such a query yields
   * zero results rather than dropping the filter, which would widen the results instead.
   */
  matchesNothing: boolean;
}

// An IT Staff user id, or the literal "unassigned". The client's "Assigned: Me" sends its own id,
// so there is no "me" value here (api-spec.md 4).
function ownerFilter(raw: unknown): Filter<number | 'unassigned'> {
  const value = firstValue(raw)?.trim();
  if (value === undefined || value === '') return { invalid: false };
  if (value === 'unassigned') return { value: 'unassigned', invalid: false };
  const id = parsePositiveInt(value);
  return id === undefined ? { invalid: true } : { value: id, invalid: false };
}

export function parseStaffQueueQuery(raw: Record<string, unknown>): StaffQueueQuery {
  const sortValue = firstValue(raw.sort) as StaffQueueSort | undefined;
  const sort = sortValue !== undefined && STAFF_QUEUE_SORTS.includes(sortValue) ? sortValue : 'createdAt';

  // Default is ascending (oldest first), unlike My Tickets' newest-first default.
  const orderValue = firstValue(raw.order)?.trim().toLowerCase();
  const order: TicketListOrder = orderValue === 'desc' ? 'desc' : 'asc';

  const page = parsePositiveInt(firstValue(raw.page)) ?? 1;

  const searchValue = firstValue(raw.search)?.trim();
  const status = enumFilter(raw.status, CURRENT_STATUSES);
  const itPriority = enumFilter(raw.itPriority, REQUESTED_PRIORITIES);
  const owner = ownerFilter(raw.owner);

  return {
    search: searchValue ? searchValue : undefined,
    status: status.value,
    itPriority: itPriority.value,
    owner: owner.value,
    sort,
    order,
    page,
    pageSize: STAFF_QUEUE_PAGE_SIZE,
    matchesNothing: status.invalid || itPriority.invalid || owner.invalid,
  };
}
