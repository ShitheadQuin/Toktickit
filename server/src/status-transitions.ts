// specification.md 11: the status transition matrix as a pure lookup, so UNIT-02 can test every
// (from, to) pair with no request or database. Claiming is its own endpoint
// (routes/staff-tickets.ts), so the claim's New -> Open row isn't here; the owner's New -> Open is.
import type { CurrentStatusValue } from './ticket-list-helpers';

export type TransitionCheck = { allowed: true; requiresOwnership: boolean } | { allowed: false };

// from -> to -> requires ownership. A pair that isn't listed is not a permitted transition.
const MATRIX: Partial<Record<CurrentStatusValue, Partial<Record<CurrentStatusValue, boolean>>>> = {
  NEW: { OPEN: true, CANCELLED: false },
  OPEN: { IN_PROGRESS: true, CANCELLED: false },
  IN_PROGRESS: { WAITING_FOR_REQUESTER: true, RESOLVED: true },
  WAITING_FOR_REQUESTER: { IN_PROGRESS: true, RESOLVED: true },
  RESOLVED: { CLOSED: true, REOPENED: false },
  CLOSED: { REOPENED: false },
  REOPENED: { IN_PROGRESS: true },
};

export function checkTransition(from: CurrentStatusValue, to: CurrentStatusValue): TransitionCheck {
  const requiresOwnership = MATRIX[from]?.[to];
  return requiresOwnership === undefined ? { allowed: false } : { allowed: true, requiresOwnership };
}
