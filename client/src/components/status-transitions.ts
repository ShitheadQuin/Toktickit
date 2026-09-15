// specification.md 11: the status transition matrix, used only to build the Staff Ticket Detail
// status dropdown - which moves to offer, and which to grey out for someone who isn't the owner.
// The server (server/src/status-transitions.ts) is the real authority and re-checks every change;
// this copy only keeps the UI from offering a move the server would refuse.

export interface StatusTransition {
  to: string;
  requiresOwnership: boolean;
}

export const STATUS_TRANSITIONS: Record<string, StatusTransition[]> = {
  NEW: [
    { to: 'OPEN', requiresOwnership: true },
    { to: 'CANCELLED', requiresOwnership: false },
  ],
  OPEN: [
    { to: 'IN_PROGRESS', requiresOwnership: true },
    { to: 'CANCELLED', requiresOwnership: false },
  ],
  IN_PROGRESS: [
    { to: 'WAITING_FOR_REQUESTER', requiresOwnership: true },
    { to: 'RESOLVED', requiresOwnership: true },
  ],
  WAITING_FOR_REQUESTER: [
    { to: 'IN_PROGRESS', requiresOwnership: true },
    { to: 'RESOLVED', requiresOwnership: true },
  ],
  RESOLVED: [
    { to: 'CLOSED', requiresOwnership: true },
    { to: 'REOPENED', requiresOwnership: false },
  ],
  CLOSED: [{ to: 'REOPENED', requiresOwnership: false }],
  REOPENED: [{ to: 'IN_PROGRESS', requiresOwnership: true }],
  CANCELLED: [],
};

// BR-18: the two transitions that ask for confirmation first.
export const CONFIRM_BEFORE: Record<string, string> = {
  CANCELLED: 'Cancel this Ticket? It will no longer be worked on.',
  REOPENED: 'Reopen this Ticket?',
};
