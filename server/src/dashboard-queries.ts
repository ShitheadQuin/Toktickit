// specification.md BR-21 to BR-26: the definitions every dashboard figure is built from. Pure, so
// UNIT-04 checks them with no request or database, and the route and the list endpoints read the
// same active-status list, so a card's count and the list its link opens always agree (BR-23).
import type { CurrentStatusValue } from './ticket-list-helpers';

// BR-21. Resolved, Closed and Cancelled are not active.
export const ACTIVE_STATUSES: CurrentStatusValue[] = ['NEW', 'OPEN', 'IN_PROGRESS', 'WAITING_FOR_REQUESTER', 'REOPENED'];

// BR-24.
export const RECENT_LIMIT = 5;
const RECENTLY_RESOLVED_MS = 7 * 24 * 60 * 60 * 1000;

export function recentlyResolvedSince(now: Date): Date {
  return new Date(now.getTime() - RECENTLY_RESOLVED_MS);
}

// BR-26: each Requester card opens My Tickets with the same filter it counted with.
export const requesterMetricLinks = {
  myOpen: '/my-tickets?statusGroup=active',
  waitingForMe: '/my-tickets?currentStatus=WAITING_FOR_REQUESTER',
  resolved: '/my-tickets?currentStatus=RESOLVED',
  closed: '/my-tickets?currentStatus=CLOSED',
} as const;

// BR-26: each Staff card opens the Ticket Queue with the same filter. My Open Actions has no list
// page of its own (specification.md 11), so it has no link.
export function staffMetricLinks(userId: number) {
  return {
    unassigned: '/staff/queue?owner=unassigned&statusGroup=active',
    myTickets: `/staff/queue?owner=${userId}&statusGroup=active`,
    highPriority: '/staff/queue?itPriority=HIGH&statusGroup=active',
    myOpenActions: null,
    status: (status: string) => `/staff/queue?status=${status}`,
    itPriority: (priority: string) => `/staff/queue?itPriority=${priority}&statusGroup=active`,
  };
}
