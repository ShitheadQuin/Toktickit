// docs/lab-03/ui-spec.md 9/14: the one place a status or role value becomes its badge class.
// PR #44 review: the role badge used `.tt-badge-role`, which was never defined, and status badges
// were built inline as `tt-badge-status-${value.toLowerCase()}` - giving `in_progress` and
// `waiting_for_requester` instead of §14's names, with no CSS for any status but NEW.
// STYLE-03 checks every class here has a rule in theme.css.

export const STATUS_BADGE_CLASS: Record<string, string> = {
  NEW: 'tt-badge-status-new',
  OPEN: 'tt-badge-status-open',
  IN_PROGRESS: 'tt-badge-status-in-progress',
  WAITING_FOR_REQUESTER: 'tt-badge-status-waiting',
  RESOLVED: 'tt-badge-status-resolved',
  CLOSED: 'tt-badge-status-closed',
  REOPENED: 'tt-badge-status-reopened',
  CANCELLED: 'tt-badge-status-cancelled',
};

export const ROLE_BADGE_CLASS: Record<string, string> = {
  REQUESTER: 'tt-badge-role-requester',
  IT_STAFF: 'tt-badge-role-it-staff',
  ADMINISTRATOR: 'tt-badge-role-administrator',
};
