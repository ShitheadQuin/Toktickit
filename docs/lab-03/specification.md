# Lab 3 Sprint Engineering Specification

## 1. Sprint Goal

Replace the Development Requester selector with real authentication and three-role,
server-enforced authorization. Deliver the first operational IT Staff workflow — a shared Ticket
Queue, ownership, IT Priority, status transitions, Public Comments and Internal Notes — and a
minimalist Administrator User Management screen, while every Lab 2 Requester function keeps
working against the authenticated user's own identity.

## 2. Stakeholder Request Interpretation

Development no longer needs a stand-in identity — the system needs real users who log in with a
password. Requesters keep exactly the ticket functions Lab 2 built, just re-pointed at their
authenticated account instead of a picked-from-a-list identity. IT Staff get the tool they've been
missing since Lab 2: a queue to find work in, the ability to claim it, prioritize it, and move it
through a defined lifecycle, while talking to the Requester in the open (Public Comments) and to
each other in private (Internal Notes). Administrators get exactly enough tooling to keep the user
list correct — nothing more. Every one of these is protected on the server, not by hiding a button:
Lab 2 didn't need that distinction because it had no real identity to protect; Lab 3 does.

## 3. Scope

### Included
- Login, logout, current-user retrieval, mandatory first-login password change
- Server-side session + role-based authorization for Requester, IT Staff, Administrator
- Migration of Lab 2 Development Requester records into the authenticated User model
- Continued Requester ownership protection for every Lab 2 Ticket/Attachment function
- IT Staff Ticket Queue: search, filter, sort, pagination
- IT Staff Ticket Detail: claim/reassign ownership, IT Priority, permitted status transitions
- Public Comments (Requester/IT Staff/Administrator) and Internal Notes (IT Staff/Administrator only)
- Requester "Problem Appears Resolved" signal (does not change status)
- Minimalist Administrator User Management: list, search, role filter, create, edit, activate/
  deactivate, set new initial password
- Zen Green UI extensions reused from Lab 2; responsive at desktop/tablet/mobile

### Excluded
- Email of any kind (invitations, password reset, initial-password delivery)
- MFA, social login, SSO, self-registration
- Actions Taken (deferred to Lab 4)
- SLA/escalation, dashboards beyond simple queue counts, departments, multi-tenancy
- Multiple roles per user, user deletion, bulk operations, import/export, account history
- Mandatory pagination, multi-column sorting, or multiple simultaneous filters on the user list

## 4. Functional Requirements

**Authentication**
- FR-01: The system shall authenticate a user by email and password and establish a server-side
  session referenced by an HttpOnly cookie.
- FR-02: The system shall provide a logout action that deletes the session record so the cookie
  is immediately unusable.
- FR-03: The system shall provide a current-user endpoint returning id, name, email, role, and
  `mustChangePassword`.
- FR-04: The system shall block access to every screen and API except password-change and
  logout while `mustChangePassword` is true, until a valid new password is saved.

**Authorization**
- FR-05: The system shall show each authenticated user only the navigation and actions permitted
  for their role.
- FR-06: The system shall enforce every authorization and ownership rule on the server,
  independent of what the client displays.

**Requester (regression + new)**
- FR-07: The system shall let a Requester create Tickets and view/manage only Tickets and
  Attachments they own, determined from the authenticated session, never from a client-supplied id.
- FR-08: The system shall let a Requester post Public Comments on their own Ticket.
- FR-09: The system shall let a Requester mark a Ticket "problem appears resolved" without
  changing its status.

**IT Staff**
- FR-10: The system shall provide IT Staff a Ticket Queue supporting search, filter, sort, and
  pagination.
- FR-11: The system shall let IT Staff open Ticket Detail for any Ticket.
- FR-12: The system shall let IT Staff claim an unassigned Ticket or reassign a Ticket's owner to
  another active IT Staff member.
- FR-13: The system shall let IT Staff set IT Priority independent of Requested
  Priority.
- FR-14: The system shall let the Ticket's current Owner perform the status transitions permitted
  by the matrix in Section 5.
- FR-15: The system shall let IT Staff post Public Comments and Internal Notes.
- FR-16: The system shall keep Internal Notes invisible to Requesters at both API and UI layers,
  including anywhere Ticket Detail embeds them inline.

**Administrator**
- FR-17: The system shall let an Administrator list users, searchable by name/email and
  filterable by role.
- FR-18: The system shall let an Administrator create a user with name, email, one role, active
  state, and an initial password.
- FR-19: The system shall let an Administrator edit a user's name, email, role, and active state,
  ignoring any other field submitted.
- FR-20: The system shall let an Administrator set a new initial password, forcing a password
  change at that user's next login.
- FR-21: The system shall prevent an Administrator from deactivating their own account.
- FR-22: The system shall prevent any change that would leave zero active Administrators.

**Migration**
- FR-23: The system shall migrate every Lab 2 Requester into the User model without losing or
  reassigning any Ticket or Attachment.
- FR-24: The system shall remove the Development Requester selector and its client-side state.

**Security hardening**
- FR-25: The system shall throttle repeated failed login attempts per account to resist password
  guessing.

## 5. Business Rules

- BR-01: Only an active user with valid credentials may authenticate. *(given)*
- BR-02: A user marked as requiring a password change cannot enter the normal application until a
  new valid password is saved. *(given)*
- BR-03: The authenticated user identity, not a `requesterId` supplied by the client, determines
  ownership of Requester operations. *(given)*
- BR-04: Public Comments are visible to the Requester, IT Staff, and Administrator. Internal Notes
  are visible only to IT Staff and Administrator. *(given)*
- BR-05: A Requester may indicate that the problem appears resolved, but cannot formally set the
  Ticket to Resolved or Closed. *(given)*
- BR-06: Invalid credentials (unknown email or wrong password) return one generic message, never
  indicating which field was wrong or whether the account exists. The check performs a bcrypt
  comparison in both cases — against the real hash when the email is found, against a dummy hash
  when it isn't — so response time cannot be used to enumerate valid emails.
- BR-07: An inactive account's correct credentials are rejected with the same generic message as
  BR-06 — inactivity is not revealed.
- BR-08: After 5 consecutive failed login attempts for the same email within 15 minutes, further
  attempts for that email are rejected until a cooldown period passes, to resist password
  guessing.
- BR-09: Passwords are hashed with bcrypt (cost factor 12) before storage; plaintext passwords are
  never persisted or logged, and request logging never includes raw request bodies for
  authentication endpoints.
- BR-10: A password must be 8–72 characters and contain at least one letter and one digit (72 is
  bcrypt's input limit).
- BR-11: Logout deletes the session record; any later request bearing the old cookie is treated as
  unauthenticated.
- BR-12: A Ticket or Attachment owned by a different Requester returns `404 NOT_FOUND` to a
  Requester — identical to one that does not exist. **This supersedes the Lab 2 rule** (Lab 2
  `api-spec.md` §1/§3 returned `403 FORBIDDEN`, justified there by "Lab 2 is not real
  authentication"). Lab 3 has real authentication, so that reasoning no longer holds; `403` is now
  reserved for role denials that reveal nothing about a specific record (e.g. a Requester calling
  `/users` or an Internal Note endpoint).
- BR-13: Any active IT Staff member may claim an unassigned Ticket or reassign a Ticket's owner
  to another active IT Staff member, regardless of current status.
- BR-14: Status transitions may only be performed by the Ticket's current Owner, except the two the
  §11 matrix marks as not requiring ownership — Cancelling a New or Open Ticket, and Reopening a
  Resolved or Closed Ticket — which any active IT Staff member may perform. An unowned Ticket must
  be claimed or reassigned before any other transition.
- BR-15: IT Priority may be set only by an active IT Staff member; Requested Priority is fixed at
  creation. (Administrator has read-only access to Tickets per BR-04 but performs no ticket
  actions — see Section 11.)
- BR-16: Public Comment and Internal Note content is rejected when empty or whitespace-only,
  capped at 2,000 characters, and always rendered as plain text — never interpreted as HTML or
  markdown — so posted content cannot execute as markup in another user's browser.
- BR-17: Public Comments and Internal Notes are append-only — no edit or delete endpoint exists in
  Lab 3.
- BR-18: Cancelling a Ticket and Reopening a Ticket each require explicit UI confirmation.
- BR-19: Email address is unique across all users (case-insensitive); a duplicate is rejected as a
  validation error.
- BR-20: Every Administrator endpoint returns `403 FORBIDDEN` to a non-Administrator without
  revealing user data.
- BR-21: An Administrator may assign only one of Requester, IT Staff, or Administrator; no other
  value is accepted.
- BR-22: An Administrator "edit user" request is applied only to `name`, `email`, `role`, and
  `isActive`; any other field present in the request body (e.g. `passwordHash`,
  `mustChangePassword`, `id`) is ignored rather than applied.
- BR-23: Deactivating a user blocks future login only — it does not delete the account or any
  Ticket, Comment, or Note they authored.
- BR-24: Migrated Lab 2 Requesters keep their original Ticket and Attachment ownership; migration
  must not reassign or drop any existing record.
- BR-25: An unexpected server error returns a generic safe-failure message with no stack trace or
  internal detail, in both the API response and the UI.
- BR-26: A Requester's Ticket Detail response never includes Internal Note content anywhere in the
  payload, even if Notes are embedded inline alongside other Ticket fields rather than fetched
  from a separate endpoint.

## 6. UI Specification Summary

Full detail lives in `ui-spec.md`. Screens: Login, Change Password (forced first-login variant and
voluntary variant), authenticated app shell (user name + role + logout, role-based nav), IT Staff
Ticket Queue (table desktop / stacked cards mobile), IT Staff Ticket Detail (extends the Lab 2
Ticket Detail layout with ownership, IT Priority, status, Comments, Notes), Administrator User
Management (list + create/edit panel). Every screen distinguishes editable from read-only fields,
uses Zen Green badges for status/priority/role, and gives feedback for loading, validation,
success, empty/no-results, forbidden, not-found, conflict, and safe API failure (Section 8.6 of
the labsheet).

## 7. Data Changes

- `Requester` is renamed/evolved into `User`: adds `passwordHash` (nullable → backfilled →
  required), `role` (enum `REQUESTER` | `IT_STAFF` | `ADMINISTRATOR`, default `REQUESTER` for
  migrated rows), `mustChangePassword` (boolean, default `true`), `isActive` (already present).
- New `Session` table: `id` (a cryptographically random opaque token, not a sequential id),
  `userId` FK, `expiresAt`, `createdAt` — backs the login cookie.
- `Ticket` gains: `ticketOwnerId` (nullable FK to `User`, constrained to `IT_STAFF`/`ADMINISTRATOR`
  roles per labsheet §4.5), `itPriority` (same enum as Requested Priority), `requesterConfirmedAt`
  (nullable timestamp — the "problem appears resolved" signal). `currentStatus` enum extends from
  the Lab 2 single value `NEW` to all eight required statuses.
- New `PublicComment` and `InternalNote` tables: `id`, `ticketId` FK, `authorId` FK to `User`,
  `body`, `createdAt`. Two tables rather than one flagged table, so a missing filter can't leak an
  Internal Note (see Section 11).
- Migration keeps every existing `Ticket`/`Attachment` row and its foreign keys untouched; only the
  `Requester` table gains columns.

## 8. API Contract

Full detail (request/response shapes, status codes, authorization matrix) lives in `api-spec.md`.
Summary of new/changed endpoints:

- `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`, `POST /auth/change-password`
- All Lab 2 Requester Ticket/Attachment endpoints — unchanged paths, now authenticated, ownership
  resolved from the session
- `GET /staff/tickets` (queue: search/filter/sort/pagination), `GET /staff/tickets/:id`
- `POST /staff/tickets/:id/claim`, `POST /staff/tickets/:id/reassign`
- `PATCH /staff/tickets/:id/priority`, `PATCH /staff/tickets/:id/status`
- `POST /tickets/:id/comments`, `GET /tickets/:id/comments`
- `POST /tickets/:id/notes` (IT Staff only), `GET /tickets/:id/notes` (IT Staff/Administrator only)
- `POST /tickets/:id/resolution-signal` (Requester "problem appears resolved")
- `GET /users`, `POST /users`, `PATCH /users/:id`, `POST /users/:id/reset-password`

Auth mechanism: server-side session, HttpOnly/`SameSite=Lax` cookie, DB-backed so logout is
immediate (see Section 11). CSRF: `SameSite=Lax` plus a strict, single allowed CORS origin (never
a wildcard) for the credentialed client — no separate CSRF token is issued in Lab 3.

## 9. Acceptance Criteria

- AC-01: Given an active user with valid credentials, when the user logs in, then the backend
  establishes authenticated access and returns the permitted user identity and role. *(given)*
- AC-02: Given a user who must change the initial password, when login succeeds, then normal
  application screens remain unavailable until a valid new password is saved. *(given)*
- AC-03: Given an authenticated Requester, when the client supplies another `requesterId`, then
  the backend still applies the authenticated identity and does not return another Requester's
  data. *(given)*
- AC-04: Given a Requester account, when an Internal Note endpoint is requested, then the
  operation is rejected without exposing note content. *(given)*
- AC-05: Given invalid credentials, when login is attempted, then the backend returns one generic
  error revealing neither which field was wrong nor whether the account exists.
- AC-06: Given an inactive user's correct credentials, when login is attempted, then the same
  generic error from AC-05 is returned.
- AC-07: Given an authenticated user, when they log out, then a later request with the old session
  cookie is treated as unauthenticated.
- AC-08: Given an authenticated user, when the current-user endpoint is called, then it returns
  id, name, email, role, and `mustChangePassword`.
- AC-09: Given a Ticket owned by a different Requester, when a Requester requests it, then the
  backend returns `404 NOT_FOUND`.
- AC-10: Given search/filter/sort/page query params, when the Ticket Queue is requested, then only
  matching results for that page return with correct pagination metadata.
- AC-11: Given an unassigned Ticket, when an IT Staff member claims it, then that member becomes
  the Ticket Owner.
- AC-12: Given a Ticket not owned by the acting IT Staff member, when they attempt a status
  transition beyond claiming, then the backend rejects it.
- AC-13: Given a Ticket in a status with a permitted next status, when the owning IT Staff member
  requests that transition, then the status updates.
- AC-14: Given a Ticket in a status without a permitted transition to the requested one, when that
  transition is requested, then the backend rejects it with a clear error.
- AC-15: Given a Ticket, when a Public Comment is posted, then it is visible to the Requester, IT
  Staff, and Administrator.
- AC-16: Given a Ticket, when an Internal Note is posted, then it is visible only to IT Staff and
  Administrator.
- AC-17: Given a Requester's own Ticket, when they mark "problem appears resolved," then status is
  unchanged and the signal is visible to IT Staff.
- AC-18: Given an email already in use, when an Administrator creates a user with it, then the
  backend rejects it with a duplicate-email error.
- AC-19: Given an Administrator sets a new initial password for a user, when that user next logs
  in, then they must change it before reaching the application.
- AC-20: Given an Administrator attempts to deactivate their own account, when the request is
  made, then the backend rejects it.
- AC-21: Given the last active Administrator, when any request would deactivate them or change
  their role, then the backend rejects it.
- AC-22: Given a non-Administrator, when they call any `/users` endpoint, then the backend returns
  `403 FORBIDDEN`.
- AC-23: Given the completed migration, when Lab 2 Tickets/Attachments are inspected, then each
  still references its correct original User and no record was lost.
- AC-24: Given any required screen, when viewed at desktop/tablet/mobile widths, then no
  horizontal scrolling, clipping, or overlap occurs.
- AC-25: Given repeated failed login attempts for one account within the cooldown window, when the
  threshold is exceeded, then further attempts for that account are rejected until the cooldown
  expires.
- AC-26: Given a Public Comment or Internal Note containing HTML/script content, when another
  permitted user views it, then the content displays as literal text, not executed markup.
- AC-27: Given a Requester views Ticket Detail, when the response is inspected, then no Internal
  Note content appears anywhere in the payload.
- AC-28: Given an Administrator submits an edit-user request containing extra fields such as
  `passwordHash`, when the request is processed, then only name/email/role/active-state are
  applied and the extra fields are ignored.

## 10. Definition of Done

- All approved scope from Section 3 is implemented.
- Every Acceptance Criterion in Section 9 has linked, passing test evidence.
- No required test is skipped, disabled, or commented out.
- Implemented screens and APIs conform to `specification.md`, `api-spec.md`, and `ui-spec.md`.
- Migration/regression evidence shows every Lab 2 Ticket and Attachment intact post-migration.
- Success, failure, and boundary cases behave as specified for every screen and endpoint.
- README setup and test instructions are current for Lab 3.
- Each PR has been peer-reviewed by Chanat-888 and approved before merge.
- The visual inspection checklist in `ui-spec.md` has been completed for every in-scope screen.

## 11. Assumptions and Decisions

- **Session cookie over JWT:** logout must actually invalidate access; a DB-backed session makes
  that a single row delete, where a JWT would need a blocklist for the same guarantee. Cookie is
  HttpOnly, `SameSite=Lax`, `Secure` outside local dev, ~12h sliding expiry. The session token
  itself is a cryptographically random opaque value, never a sequential id, so it can't be guessed.
- **CSRF stance:** `SameSite=Lax` plus a strict single-origin CORS policy (never a wildcard) for
  the credentialed client is treated as sufficient for a same-site course app; no separate CSRF
  token scheme is introduced in Lab 3.
- **Password rule:** 8–72 characters, at least one letter and one digit. No forced special
  character, since there's no self-service reset path (email is out of scope) to recover from a
  rule a user can't work around alone. 72 is bcrypt's input limit, so the field is capped there.
- **bcrypt cost factor 12**, chosen as a standard, well-tested balance of hashing cost vs. login
  latency for this scale of app.
- **Login throttling:** 5 failed attempts per email per 15 minutes, then a cooldown, to resist
  password guessing given the minimum password length is short. Numbers are a reasonable default,
  not dictated by the labsheet.
- **Two Comment tables, not one with a flag:** `PublicComment`/`InternalNote` as separate tables
  makes an accidental leak of a private note structurally impossible, rather than dependent on
  every query remembering a `WHERE isInternal = false`.
- **Status transition matrix** (statuses: New, Open, In Progress, Waiting for Requester, Resolved,
  Closed, Reopened, Cancelled):

  | From | To | Who | Requires ownership | UI confirms |
  |---|---|---|---|---|
  | New | Open | IT Staff (claim) | no | no |
  | New | Open | IT Staff (owner, after a reassign) | yes | no |
  | Open | In Progress | IT Staff | yes | no |
  | In Progress | Waiting for Requester | IT Staff | yes | no |
  | Waiting for Requester | In Progress | IT Staff | yes | no |
  | In Progress / Waiting for Requester | Resolved | IT Staff | yes | no |
  | Resolved | Closed | IT Staff | yes | no |
  | Resolved / Closed | Reopened | IT Staff | no | yes |
  | Reopened | In Progress | IT Staff | yes | no |
  | New / Open | Cancelled | IT Staff | no | yes |

  Claiming and reassignment (changing the Owner) are ownership changes, not status transitions,
  and are available to any active IT Staff member at any status (BR-13). Two rows were added in
  Issue #38 after checking the matrix against seeded data: without **Reopened → In Progress** a
  reopened Ticket had no way forward, and without the owner's **New → Open** a New Ticket that was
  reassigned before anyone claimed it could never be opened (claim only accepts unassigned Tickets).
- **"Problem Appears Resolved"** sets `requesterConfirmedAt` on the Ticket; it never touches
  `currentStatus` (BR-05). Only IT Staff can move a Ticket to Resolved. It is refused on a Closed
  or Cancelled Ticket, and a repeat keeps the first time, since the signal records when the
  Requester first saw the problem as fixed.
- **Posting an Internal Note does not change the Ticket's `updatedAt`**; a Public Comment and every
  IT Staff Ticket action do. Otherwise a Requester's "Last Updated" would move with no visible
  reason and reveal that private activity happened (BR-26).
- **Claim is atomic:** the owner and status are written only if the Ticket is still unassigned and
  New at that moment, so two IT Staff claiming at the same instant get one success and one
  `409 ALREADY_ASSIGNED`, never two owners in turn.
- **Queue query contract:** searchable — ticket number, summary/description text, requester name/
  email. Filterable — status, IT Priority, and owner (a specific IT Staff member, or unassigned); a
  requester is found through search, not a separate filter. Sortable — createdAt, IT
  Priority, status. Default order — createdAt ascending (oldest first). Page size 20. Pagination
  metadata: `{ data, page, pageSize, totalCount, totalPages }`. Invalid query params fall back to
  the default rather than returning `400`, so a mistyped URL degrades gracefully instead of
  breaking the queue.
- **Queue columns (7):** Ticket #, Summary, Requester, Status, IT Priority, Assigned To, Created.
  Requested Priority is dropped from the queue (still visible in Ticket Detail) since IT Priority
  is what staff actually triage by — showing both risked the "mega-grid" the labsheet warns
  against.
- **Administrator does not perform IT Staff ticket operations** — matches the labsheet §4.3
  default. The `ticketOwnerId` foreign key is still typed to accept either an `IT_STAFF` or
  `ADMINISTRATOR` user (per labsheet §4.5, which allows either), but no Lab 3 UI or API path lets
  an Administrator claim, reassign, or change a Ticket's status — only the schema stays open for a
  later lab. Labsheet §4.5 permits Administrator ownership and IT Priority changes; this
  authorization matrix, as §4.3 allows, restricts both to IT Staff.
- **Migration of existing Requesters:** every Lab 2 Requester becomes a `User` with role
  `REQUESTER`, `mustChangePassword: true`, and a shared local-dev initial password documented in
  the seed script and the README — never a real credential, never committed as a secret beyond
  that explicit "local development only" label.
- **Non-owned Ticket/Attachment now `404`, not `403`** — see BR-12. The Lab 2 docs are left as
  written, since they record what Lab 2 actually delivered; only the Lab 2 *tests* that assumed
  `403` are updated, with the change explained in that PR.
- **Initial-password issuance (labsheet §6's "approved local-lab behavior"):** since email is out
  of scope, the system generates a random initial password server-side on user creation and on
  password reset, and returns it **once**, in that API response only, for the Administrator to
  relay to the user out-of-band. It is never stored in plaintext (only its hash) and is never
  retrievable again after that single response.
- **Administrator ticket access is read-only, not zero:** BR-04 (given) requires Public Comments
  visible to Administrator and Internal Notes visible to IT Staff *and* Administrator — that's a
  fixed viewing right. What Administrator cannot do (per the §4.3 default already recorded above)
  is claim, reassign, change status/priority, or post a Comment/Note. Read access and write access
  are decided independently, and only the write side is restricted.

## 12. Seed Data

Idempotent (upsert by unique email, safe to re-run), per labsheet §5.3:
- 4 active Requesters + 1 inactive Requester
- 3 active IT Staff + 1 inactive IT Staff
- 1 active Administrator
- Tickets spread across requesters, all 8 statuses, both priorities, assigned and unassigned
- A handful of Public Comments and Internal Notes per ticket with non-sensitive example content
- All seeded accounts share one documented local-dev-only initial password, `mustChangePassword: true`
