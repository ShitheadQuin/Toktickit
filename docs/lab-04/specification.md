# Lab 4 Sprint Engineering Specification

Numbering note: Lab 4 restarts its own FR, BR and AC numbers at 01, as the labsheet's own examples
do (BR-01, BR-02, AC-01). A Lab 3 rule is always cited with its lab, for example "Lab 3 BR-13".
Every Lab 3 rule stays in force unless Section 11 of this document says it is superseded.

## 1. Sprint Goal

Complete the TokTickIT service desk workflow. IT Staff and Administrators record the actual work
on a Ticket as Actions Taken, the backend decides when a Ticket may be Resolved, every role gets a
short dashboard that leads into the detailed screens, and the whole Lab 1 to 3 product keeps
working, now hardened against stale updates and repeated clicks.

## 2. Stakeholder Request Interpretation

Until now IT Staff could claim a Ticket and talk about it, but the work itself left no record. The
service desk wants a work log under each Ticket: what was done, when, with what result, by whom,
and whether anything still needs a follow up. Several staff members may each do part of the work
while one Ticket Owner stays responsible for the whole Ticket. Because the log now exists, the
system can refuse to call a Ticket resolved while its work is unfinished, and a Requester saying
"looks fixed" stays a hint, never the decision. Each role also wants a starting page that shows
at a glance what needs attention and links straight to the matching list. Finally, everything
built in Labs 1 to 3 has to keep working and look like one finished application.

## 3. Scope

### Included
- Actions Taken under a Ticket: create, list, view, edit, assign, status (Planned, In Progress,
  Completed, Cancelled), follow up, attachment notes
- Requester read only view of all Actions Taken on their own Tickets
- Final Ticket transition matrix with a backend resolution gate
- Administrator performs every IT Staff Ticket operation (supersedes Lab 3)
- Stale update detection on every Ticket workflow write and every Action update
- Append only Ticket status history, shown on Ticket Detail
- Requester dashboard and IT Staff dashboard (Administrator reuses it, plus user counts)
- Dashboard drill down into My Tickets and the Ticket Queue through URL filters
- Additive migration, idempotent seed, full Lab 1 to 3 regression, final polish and README

### Excluded (labsheet §4.2)
- SLA clocks, escalation engines, on call scheduling, breach notifications
- Email, SMS, LINE, push or any other external notification
- Inventory, spare parts, purchasing, service cost accounting
- Timesheets, billing, payroll, labor cost
- Multi level approval workflows and electronic signatures
- BI tools, custom report builders, exports
- Multi tenancy and production scale cloud operations
- "Change since yesterday" trend figures on dashboard cards (Section 11)
- Deleting an Action Taken, and file upload on an Action (Attachment Notes is text only)

## 4. Functional Requirements

**Actions Taken**
- FR-01: The system shall let IT Staff and Administrators create an Action Taken on a Ticket with
  Action Date/Time, Action Description, Result, Assignee, Status, Follow Up Required, Follow Up
  Note and Attachment Notes.
- FR-02: The system shall set Performed By automatically to the authenticated user who creates the
  Action, never from a value the client sends.
- FR-03: The system shall let IT Staff and Administrators edit an Action and move it through the
  Action status rules while it is Planned or In Progress.
- FR-04: The system shall list a Ticket's Actions Taken in a stable order, to IT Staff and
  Administrators for any Ticket and to a Requester, read only, for their own Tickets.
- FR-05: The system shall treat a repeated create request carrying the same client request id as
  the same Action, so a double click or a network retry never creates two.

**Ticket workflow**
- FR-06: The system shall let an Administrator perform every IT Staff Ticket operation: queue,
  Ticket Detail, claim, reassign, IT Priority, status, Public Comments, Internal Notes and Actions
  Taken.
- FR-07: The system shall enforce the transition matrix and the resolution gate on the server,
  whatever the client sends.
- FR-08: The system shall reject a Ticket or Action write that was based on an out of date copy,
  so no user unknowingly overwrites another user's recent change.
- FR-09: The system shall record every Ticket status change in an append only history and show it
  on Ticket Detail.
- FR-10: The system shall show only permitted status transitions, explain why Resolved is not yet
  available, and refresh the Ticket summary after a successful change.

**Dashboards**
- FR-11: The system shall provide a Requester dashboard summarising only that Requester's Tickets.
- FR-12: The system shall provide an IT Staff dashboard to IT Staff and Administrators, with user
  account counts added for Administrators.
- FR-13: The system shall link every dashboard card to the matching filtered list or Ticket, and
  My Tickets and the Ticket Queue shall read their filters from the page URL.
- FR-14: The system shall show a Dashboard navigation item to every role and open the dashboard
  after sign in.

**Hardening and regression**
- FR-15: The system shall keep every Lab 1 to 3 function working for its permitted roles.
- FR-16: The system shall give consistent loading, validation, success, empty, no results,
  forbidden, conflict, not found and safe failure feedback on every screen.
- FR-17: The system shall disable a submit control while its request is pending and keep the
  user's input after a recoverable failure.
- FR-18: The system shall ship with no console errors, broken links, placeholder text or
  unfinished controls, and with current README setup, migration, seed, test and demo steps.

## 5. Business Rules

**Actions Taken**
- BR-01: An Action Taken belongs to exactly one Ticket. *(given)*
- BR-02: The Ticket Owner coordinates the Ticket, but an Action Taken may be performed by a
  different IT Staff member. *(given)*
- BR-03: Only IT Staff and Administrators may create or update an Action Taken. A Requester
  receives `403 FORBIDDEN` for any Action write, and `404 NOT_FOUND` when reading the Actions of a
  Ticket they do not own. The backend enforces both.
- BR-04: Performed By is the authenticated creator and never changes afterwards.
- BR-05: The Assignee must be an active IT Staff member or Administrator. It defaults to the
  creator. An inactive user is rejected with `400`, code `ASSIGNEE_INACTIVE`; a Requester or
  unknown user with `400`, code `ASSIGNEE_INVALID`.
- BR-06: Action Date/Time is required. It may not be earlier than the minute the Ticket was created
  (the form's date and time field holds whole minutes), nor more than 5 minutes after the server's
  current time (allowing for clock drift).
- BR-07: Action Description is required, trimmed, 1 to 2,000 characters. Result is up to 2,000
  characters and **required when the status is Completed**. Attachment Notes is up to 500
  characters.
- BR-08: When Follow Up Required is true, Follow Up Note is required, 1 to 2,000 characters. When
  it is false, any Follow Up Note sent is discarded and stored as empty.
- BR-09: Action status rules: an Action may be created as Planned, In Progress or Completed.
  Planned may move to In Progress, Completed or Cancelled. In Progress may move to Completed or
  Cancelled. Completed and Cancelled are final: the whole Action becomes read only, and any
  update returns `409`, code `ACTION_LOCKED`.
- BR-10: No Action may be created or updated on a Closed or Cancelled Ticket (`409`, code
  `TICKET_CLOSED`).
- BR-11: Actions are never deleted. A mistaken Action is withdrawn by cancelling it, which keeps
  the record.
- BR-12: Creating or updating an Action updates the Ticket's `updatedAt`, since Actions are
  visible to the Requester.

**Assignment and ownership**
- BR-13: The Ticket Owner must be an active IT Staff member or Administrator. Claim and reassign
  are available to both roles.
- BR-14: Transitions the matrix marks as needing ownership may only be made by the current Ticket
  Owner, whichever of the two roles they hold (Lab 3 BR-14, extended to Administrators).

**Status and resolution**
- BR-15: The permitted transitions are the matrix in Section 11. Anything else is rejected with
  `409`, code `INVALID_TRANSITION`.
- BR-16: **Resolution gate.** A Ticket may move to Resolved only when it has at least one
  Completed Action and no Action that is Planned or In Progress. Cancelled Actions are ignored.
  Otherwise the request is rejected with `409`, code `RESOLUTION_GATE_NOT_MET`, even when the
  client bypasses the normal screen. The check and the status write run in one transaction.
- BR-17: A Requester's "Problem Appears Resolved" signal is advisory and never changes the status
  (Lab 3 BR-05, unchanged).
- BR-18: Every successful status change, including the one made by a claim, appends exactly one
  status history row in the same transaction. History rows are never updated or deleted, and are
  always read in `changedAt`, then `id`, order.

**Concurrency and duplicates**
- BR-19: Every Ticket carries a `version` number, and every Action its own. Claim, reassign, IT
  Priority, status and Action update requests must send the `expectedVersion` they were based on.
  If it no longer matches, nothing is written and the response is `409`, code `STALE_UPDATE`.
  Each successful write increases the version by one.
- BR-20: A create request whose `clientRequestId` matches an existing Action on the same Ticket
  returns that Action with `200` instead of creating a second one.

**Dashboards**
- BR-21: The *active* statuses are New, Open, In Progress, Waiting for Requester and Reopened.
  Resolved, Closed and Cancelled are not active.
- BR-22: Requester dashboard figures count only Tickets whose Requester is the authenticated
  user. The endpoint takes no user id parameter.
- BR-23: Every figure is calculated by the backend from the database at request time. Nothing is
  cached or stored. A card's count always equals the total count of the list its link opens.
- BR-24: "Recent" means the 5 most recently updated Tickets (`updatedAt` descending, then `id`
  descending). "Recently resolved" means Resolved Tickets updated in the last 7 × 24 hours.
  Times are stored in UTC and displayed in Asia/Bangkok time.
- BR-25: A figure with no matching records shows `0`, and an empty list shows a short explanatory
  sentence. Neither is hidden.
- BR-26: The exact calculations are:

  | Dashboard | Figure | Calculation | Drill down |
  |---|---|---|---|
  | Requester | My Open Tickets | own Tickets, active status | `/my-tickets?statusGroup=active` |
  | Requester | Waiting for Me | own Tickets, Waiting for Requester | `/my-tickets?currentStatus=WAITING_FOR_REQUESTER` |
  | Requester | Resolved | own Tickets, Resolved | `/my-tickets?currentStatus=RESOLVED` |
  | Requester | Closed | own Tickets, Closed | `/my-tickets?currentStatus=CLOSED` |
  | Requester | My Recent Tickets | own Tickets, BR-24 recent | each row opens the Ticket |
  | Requester | Recently Resolved | own Tickets, BR-24 recently resolved, up to 5 | each row opens the Ticket |
  | Staff | Unassigned | no owner, active status | `/staff/queue?owner=unassigned&statusGroup=active` |
  | Staff | My Tickets | owner is me, active status | `/staff/queue?owner=<my id>&statusGroup=active` |
  | Staff | High IT Priority | IT Priority High, active status | `/staff/queue?itPriority=HIGH&statusGroup=active` |
  | Staff | My Open Actions | Actions assigned to me, Planned or In Progress | up to 5 listed, each opens its Ticket |
  | Staff | By Status | count per status, all 8 | `/staff/queue?status=<status>` |
  | Staff | By IT Priority | count per IT Priority, active status | `/staff/queue?itPriority=<p>&statusGroup=active` |
  | Staff | Recent Tickets | all Tickets, BR-24 recent | each row opens the Ticket |
  | Administrator only | User Accounts | active users per role, and inactive users | `/users` |

**Carried forward**
- BR-27: An unexpected server error returns a generic safe message with no internal detail
  (Lab 3 BR-25, unchanged).
- BR-28: Content in any Action text field is stored and shown as plain text, never as HTML
  (same rule as Lab 3 BR-16 for comments).

## 6. UI Specification Summary

Full detail is in `ui-spec.md`. New screens: Requester Dashboard and Staff Dashboard, at
`/dashboard` for every role. Staff Ticket Detail gains an Actions Taken section (list with create
mode and view/edit mode, table from 992 px, cards below) and a Status History list. Requester
Ticket Detail gains read only Actions Taken and Status History. The status control lists only
permitted transitions and explains a blocked Resolved. My Tickets and the Queue read their filters
from the URL. Every screen keeps the Zen Green tokens, badges, feedback states, focus styles and
breakpoints of Labs 2 and 3.

## 7. Data Changes

All changes are additive. No table, column or row from Labs 1 to 3 is removed or rewritten.

- New enum `ActionStatus`: `PLANNED`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED`.
- New table `ActionTaken`: `id`, `ticketId` (FK to Ticket, delete restricted), `actionAt`,
  `description` (varchar 2000), `result` (varchar 2000, nullable), `status` (default `PLANNED`),
  `performedById` (FK to User), `assigneeId` (FK to User), `followUpRequired` (default false),
  `followUpNote` (varchar 2000, nullable), `attachmentNotes` (varchar 500, nullable),
  `clientRequestId` (varchar 64, nullable), `version` (default 0), `createdAt`, `updatedAt`.
  Unique `(ticketId, clientRequestId)`. Indexes `(ticketId, actionAt)`, `assigneeId`, `status`.
- New table `TicketStatusHistory`: `id`, `ticketId` (FK), `fromStatus`, `toStatus`,
  `changedById` (FK to User), `changedAt`. Index `(ticketId, changedAt)`.
- `Ticket` gains `version Int NOT NULL DEFAULT 0`.
- **Migration:** one hand checked Prisma migration. PostgreSQL fills `version = 0` for every
  existing Ticket; the two new tables start empty.
- **Legacy Tickets:** have zero Actions and no history rows. They behave like any Ticket: the
  resolution gate applies only on their next move to Resolved, and Tickets already Resolved or
  Closed are untouched. The UI says "No status changes recorded since Lab 4" when history is empty.
  Dashboards count legacy Tickets exactly like new ones.
- **Recovery:** a `pg_dump` taken before the migration, plus the down script
  `server/prisma/rollback/lab4_actions_taken.down.sql`, which drops only the two tables, the enum and
  the column. MIG-01 applies it to a copy of Lab 3 data, checks every earlier row is unchanged, and
  migrates forward again.
- **Delete behavior:** an Action's Ticket link is `RESTRICT` (Actions are never deleted, BR-11). A
  history row's Ticket link is `CASCADE`: the app never deletes a Ticket, and this lets test
  fixtures remove their own Tickets.
- **Seed:** stays idempotent (Section 12).

## 8. API Contract

Full detail is in `api-spec.md`. New and changed endpoints:

- `GET /api/tickets/:id/actions`, `POST /api/staff/tickets/:id/actions`, `PATCH /api/staff/actions/:id`
- `GET /api/tickets/:id/history`
- `GET /api/dashboard/requester`, `GET /api/dashboard/staff`
- Every `/api/staff/*` route now admits Administrators as well as IT Staff
- Claim, reassign, priority and status now require `expectedVersion` and may return
  `409 STALE_UPDATE`; status may return `409 RESOLUTION_GATE_NOT_MET`
- `statusGroup=active` added to `GET /api/tickets` and `GET /api/staff/tickets`
- Posting Public Comments and Internal Notes now admits Administrators
- Every other Lab 2 and Lab 3 endpoint is unchanged

## 9. Acceptance Criteria

**Actions Taken**
- AC-01: Given a permitted IT Staff user and valid data, when an Action Taken is created, then it
  is saved under the correct Ticket with the authenticated creator and approved assignee. *(given)*
- AC-02: Given an authenticated Requester, when dashboard data is retrieved, then only metrics and
  recent Tickets owned by that Requester are returned. *(given)*
- AC-03: Given a Ticket with an unfinished Action, when IT Staff try to resolve it, then it is
  refused with the reason shown; after the Action is completed, resolving succeeds and the
  Requester sees the Resolved status and the Actions.
- AC-04: Given a Requester, when they call any Action create or update endpoint directly, then the
  backend returns `403` and nothing is written.
- AC-05: Given a Requester, when they read Actions for their own Ticket, then all Actions are
  returned; for another Requester's Ticket, `404`.
- AC-06: Given an inactive user, or a user who is not IT Staff or Administrator, as assignee, when
  an Action is saved, then it is rejected with the matching error code.
- AC-07: Given a missing description, a Completed Action without a result, follow up ticked
  without a note, or a date outside BR-06, when saved, then `400` names each failing field.
- AC-08: Given an Action, when a status change permitted by BR-09 is requested it succeeds, and any
  change to a Completed or Cancelled Action returns `409 ACTION_LOCKED`.
- AC-09: Given a Ticket owned by one IT Staff member, when other staff members add Actions, then
  all are saved with their own Performed By and listed in Action Date/Time order.
- AC-10: Given a Closed or Cancelled Ticket, when an Action is created or updated, then
  `409 TICKET_CLOSED` is returned.
- AC-11: Given two create requests with the same `clientRequestId`, when both arrive, then exactly
  one Action exists.
- AC-12: Given an Action edited by someone else since it was loaded, when a stale update is sent,
  then `409 STALE_UPDATE` is returned and the Action is unchanged.

**Ticket workflow**
- AC-13: Given a Ticket changed by someone else since it was loaded, when a stale claim, reassign,
  priority or status request is sent, then `409 STALE_UPDATE` is returned and nothing changes.
- AC-14: Given a Ticket with no Completed Action, or with any Planned or In Progress Action, when a
  move to Resolved is sent straight to the API, then `409 RESOLUTION_GATE_NOT_MET` is returned.
- AC-15: Given a Ticket meeting the gate, when its owner resolves it, then the status becomes
  Resolved and one history row records the change.
- AC-16: Given an Administrator, when they claim, change status, set IT Priority or add an Action,
  then each succeeds exactly as for IT Staff.
- AC-17: Given a transition not in the matrix, when requested, then `409 INVALID_TRANSITION`.
- AC-18: Given several status changes, when history is read, then rows appear in change order and
  no endpoint can edit or delete them.
- AC-19: Given a Requester's "Problem Appears Resolved", when sent, then the status is unchanged.
- AC-20: Given Staff Ticket Detail, when the status control opens, then only permitted transitions
  are offered and a blocked Resolved states why.

**Dashboards**
- AC-21: Given seeded data, when the Staff dashboard is requested, then every figure equals the
  result of its BR-26 query run directly against the database.
- AC-22: Given a Requester, when the Staff dashboard is requested, then `403`; given IT Staff, no
  user counts are returned; given an Administrator, user counts are returned.
- AC-23: Given no matching records, when a dashboard loads, then figures show `0` and lists show
  their empty text.
- AC-24: Given a dashboard card, when its link is followed, then the list opens with that filter
  applied and its total equals the card's count.

**Migration, regression, hardening**
- AC-25: Given the Lab 3 database, when the migration runs, then every User, Ticket, Attachment,
  Public Comment and Internal Note is still present and unchanged, and every Ticket has version 0
  and no Actions.
- AC-26: Given the seed run twice, when rows are counted, then counts are identical and Tickets
  with zero, one and several Actions exist.
- AC-27: Given every Lab 4 screen, when viewed at desktop, tablet and mobile widths, then there is
  no horizontal scroll, clipping or overlap.
- AC-28: Given keyboard only use, when operating the dashboards and the Actions Taken section, then
  every control is reachable and operable with a visible focus indicator.
- AC-29: Given the Lab 1 to 3 automated suites, when run on the Lab 4 code, then all pass (with
  only the deliberate Administrator changes listed in Section 11).
- AC-30: Given a failed save of an Action, when the error is shown, then the typed input is kept.
- AC-31: Given a double click on Save, when the Action form submits, then one Action is created.
- AC-32: Given seeded data, when either dashboard endpoint is called, then it responds within
  1 second on the local development setup.

## 10. Definition of Done

- All scope in Section 3 is implemented and nothing in the excluded list was built.
- Every Acceptance Criterion has at least one linked test in `tests.md`, and every test passes.
- No test is skipped, disabled, commented out or known to be flaky.
- Every write is authorized by the backend; hidden controls are never the only protection.
- The code matches `specification.md`, `api-spec.md` and `ui-spec.md`; any change was made in the
  documents first.
- The migration preserves every earlier record, and the seed runs twice without duplicates.
- Every Lab 1 to 3 suite passes, and every Lab 4 screen passes the `ui-spec.md` checklist at
  desktop, tablet and mobile.
- No console errors, broken links, placeholder text or unfinished controls remain.
- README setup, migration, seed, test and demo steps are current.
- Every PR was reviewed and approved by Chanat-888 before merge into `lab4-staging`, and the
  release PR merged into `main`.
- The full test output from `main` is recorded for submission.

## 11. Assumptions and Decisions

- **Actions carry an Assignee and a Status beyond the labsheet's field list.** §8.3 lists the
  fields, but the Part 6 rubric grades assign, status transition, complete, cancel and inactive
  assignee rejection, and AC-01 mentions an approved assignee. The two extra fields make every one
  of those real. Performed By records who created the Action; Assignee records who is doing it.
- **Resolution gate: at least one Completed Action and none Planned or In Progress.** This makes
  "IT Staff must review the work" something the system can check: a Ticket cannot be resolved with
  no recorded work or with work still open. Cancelled Actions are ignored so a withdrawn Action
  never blocks resolution.
- **Administrator performs IT Staff behavior, superseding Lab 3.** Lab 3 §11 decided the
  Administrator performs no Ticket actions. Lab 4 §4.3 says the Administrator performs IT Staff
  behavior, so every `/api/staff/*` route, both staff screens, comment and note posting and the
  Ticket Owner list now include Administrators. The Lab 3 tests that expected `403` for an
  Administrator (API-12, API-14 and the matching navigation checks) are changed on purpose in the
  workflow Issue's PR. The route prefix stays `/api/staff` so no Lab 3 client path changes.
- **Database decision 1, integer version over a timestamp.** `updatedAt` could serve as the
  concurrency token, but two writes in the same millisecond, or a write that does not change
  `updatedAt` (an Internal Note deliberately does not), would slip past it. An integer that every
  workflow write increases is exact and easy to test.
- **Database decision 2, an enum for Action status.** The four values are fixed by the business
  rules and change only with a code change, the same reasoning `CurrentStatus` used. A reference
  table would add a join and seed rows for no benefit.
- **Database decision 3, a status history table.** Part 7 grades append only behavior and stable
  ordering. A separate table with no update or delete route makes that structural rather than a
  convention, and keeps history out of the comment tables.
- **Database decision 4, `clientRequestId` with a unique index.** Disabling the button stops a
  double click, but not a network retry. A client generated id per form submission, unique per
  Ticket, turns a retried create into a harmless repeat.
- **Transition matrix,** unchanged from Lab 3 except that "IT Staff" now means IT Staff or
  Administrator, and Resolved carries the gate:

  | From | To | Needs ownership | Extra rule | UI confirms |
  |---|---|---|---|---|
  | New | Open | no (claim) / yes (owner after reassign) | | no |
  | Open | In Progress | yes | | no |
  | In Progress | Waiting for Requester | yes | | no |
  | Waiting for Requester | In Progress | yes | | no |
  | In Progress, Waiting for Requester | Resolved | yes | resolution gate (BR-16) | no |
  | Resolved | Closed | yes | | no |
  | Resolved, Closed | Reopened | no | | yes |
  | Reopened | In Progress | yes | | no |
  | New, Open | Cancelled | no | | yes |

  Cancelled is final. A Reopened Ticket keeps its Actions; new Actions are added for the new work,
  and the gate applies again the next time it is resolved.
- **Actions may be added while a Ticket is New, Open, In Progress, Waiting, Resolved or Reopened,**
  not only by the owner (BR-02). Adding one to a Resolved Ticket does not reopen it; that stays a
  deliberate status change.
- **No "+3 from yesterday" figures.** The labsheet's mockup shows them, but §4.6 does not require
  them, and they would need daily snapshots that nothing else uses.
- **"My Open Actions" has no list page of its own.** The dashboard shows up to 5 with links to
  their Tickets; a separate Actions list screen is not asked for and would be a new feature (§4.2).
- **Time zone:** no figure is cut at a calendar day, so only display is affected: dates show in
  Asia/Bangkok time, as elsewhere in the app.
- **Dashboard route:** one client path, `/dashboard`, renders the dashboard for the signed in
  role, and `/` goes there after sign in. My Tickets, Queue and Users stay in the navigation.

## 12. Seed Data

Idempotent, extending the Lab 3 seed (upserts by unique key; Actions are added only to a Ticket
that has none yet, the same pattern Lab 3 used for comments). Uses the existing Lab 3 accounts and
Tickets, so every status, priority, assigned and unassigned case is already covered, and adds:
- Tickets with zero Actions (the New and Cancelled ones), one Action, and several Actions by
  different staff members on one Ticket
- Every Action status, at least one Action with a follow up, and at least one with Attachment Notes
- An Action assigned to a staff member other than its performer
- The Resolved and Closed seed Tickets carry Completed Actions, so seeded data obeys the gate
- At least one Requester and one IT Staff member for whom some dashboard figures are zero, and
  others for whom they are not
- All seeded content is realistic and contains nothing sensitive
