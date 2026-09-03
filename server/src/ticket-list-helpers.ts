// Pure helpers for the My Tickets list query (api-spec.md 4).
// Kept out of the route handler so UNIT-04 can test them with no request, clock or database -
// the lesson recorded from Issue #13, where inline handler logic could not be unit tested at all.

export const TICKET_LIST_SORTS = [
  'ticketDate',
  'ticketNumber',
  'requestedPriority',
  'currentStatus',
  'updatedAt',
] as const;

export type TicketListSort = (typeof TICKET_LIST_SORTS)[number];
export type TicketListOrder = 'asc' | 'desc';

export type CurrentStatusValue = 'NEW';
export type RequestedPriorityValue = 'LOW' | 'MEDIUM' | 'HIGH';

const PERMITTED_PAGE_SIZES = [5, 10, 20];
const CURRENT_STATUSES: CurrentStatusValue[] = ['NEW'];
const REQUESTED_PRIORITIES: RequestedPriorityValue[] = ['LOW', 'MEDIUM', 'HIGH'];

export const TICKET_LIST_DEFAULTS = {
  sort: 'ticketDate' as TicketListSort,
  order: 'desc' as TicketListOrder,
  page: 1,
  pageSize: 10,
};

export interface TicketListQuery {
  search?: string;
  categoryId?: number;
  relatedSystemId?: number;
  currentStatus?: CurrentStatusValue;
  requestedPriority?: RequestedPriorityValue;
  sort: TicketListSort;
  order: TicketListOrder;
  page: number;
  pageSize: number;
  /**
   * True when a filter carried a value no Ticket can hold - a non-numeric id, or a status or
   * priority outside the enum. api-spec.md 4: such a query yields zero results rather than
   * dropping the filter, because dropping it would widen the result set instead of narrowing it.
   */
  matchesNothing: boolean;
}

/** Express parses a repeated parameter (?page=2&page=9) into an array; take the first value. */
function firstValue(raw: unknown): string | undefined {
  if (Array.isArray(raw)) return typeof raw[0] === 'string' ? raw[0] : undefined;
  return typeof raw === 'string' ? raw : undefined;
}

/** Digits only, at least 1. Rejects '0', '-3', '2.5' and 'two' without throwing. */
function parsePositiveInt(raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined;
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) return undefined;
  const parsed = Number(trimmed);
  return Number.isSafeInteger(parsed) && parsed >= 1 ? parsed : undefined;
}

type Filter<T> = { value?: T; invalid: boolean };

function idFilter(raw: unknown): Filter<number> {
  const value = firstValue(raw);
  // Absent, or present but blank (a filter control reset to "All"): not filtering at all.
  if (value === undefined || value.trim() === '') return { invalid: false };
  const id = parsePositiveInt(value);
  return id === undefined ? { invalid: true } : { value: id, invalid: false };
}

function enumFilter<T extends string>(raw: unknown, permitted: T[]): Filter<T> {
  const value = firstValue(raw);
  if (value === undefined || value.trim() === '') return { invalid: false };
  // The membership check above is what makes the narrowing to T sound.
  return permitted.includes(value as T) ? { value: value as T, invalid: false } : { invalid: true };
}

export function parseTicketListQuery(raw: Record<string, unknown>): TicketListQuery {
  const sortValue = firstValue(raw.sort) as TicketListSort | undefined;
  const sort = sortValue !== undefined && TICKET_LIST_SORTS.includes(sortValue)
    ? sortValue
    : TICKET_LIST_DEFAULTS.sort;

  const orderValue = firstValue(raw.order)?.trim().toLowerCase();
  const order: TicketListOrder =
    orderValue === 'asc' || orderValue === 'desc' ? orderValue : TICKET_LIST_DEFAULTS.order;

  const page = parsePositiveInt(firstValue(raw.page)) ?? TICKET_LIST_DEFAULTS.page;

  const pageSizeValue = parsePositiveInt(firstValue(raw.pageSize));
  const pageSize =
    pageSizeValue !== undefined && PERMITTED_PAGE_SIZES.includes(pageSizeValue)
      ? pageSizeValue
      : TICKET_LIST_DEFAULTS.pageSize;

  const searchValue = firstValue(raw.search)?.trim();
  const search = searchValue ? searchValue : undefined;

  const category = idFilter(raw.category);
  const relatedSystem = idFilter(raw.relatedSystem);
  const currentStatus = enumFilter(raw.currentStatus, CURRENT_STATUSES);
  const requestedPriority = enumFilter(raw.requestedPriority, REQUESTED_PRIORITIES);

  return {
    search,
    categoryId: category.value,
    relatedSystemId: relatedSystem.value,
    currentStatus: currentStatus.value,
    requestedPriority: requestedPriority.value,
    sort,
    order,
    page,
    pageSize,
    matchesNothing:
      category.invalid || relatedSystem.invalid || currentStatus.invalid || requestedPriority.invalid,
  };
}
