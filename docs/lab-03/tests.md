# Lab 3 Test Plan and Results

## 1. Test Strategy

Tests are written before implementation, per Issue: each Issue's failing tests are committed
first, confirmed to fail for the expected reason, then the smallest correct implementation makes
them pass. A PR is not merged with a skipped, disabled, or unrelated test. Labsheet §10 requires
eight coverage levels for Lab 3 — unit, API/integration, UI component, UI style, responsive,
security/authorization, migration/regression, and E2E — all eight appear as their own `Type` value
below rather than being folded into a generic "API" bucket, so the coverage is traceable at a
glance. Keyboard accessibility, which §10 also names among the tests to identify, has its own
`Accessibility` row too. The full suite is re-run on `main` after the release PR, and that final run is the
evidence submitted for Part 3.

## 2. Planned Tests

| Test ID | Type | Requirement / AC | What It Tests | Expected Result | Automated Test File | Final |
|---|---|---|---|---|---|---|
| UNIT-01 | Unit | BR-10 | Password rule validator at its boundaries (7/8/72/73 chars, missing letter, missing digit) | 8–72 with ≥1 letter and ≥1 digit accepted; every boundary violation rejected | `server/tests/lab-03/password-rules.unit.test.ts` | Pass |
| UNIT-02 | Unit | `specification.md` §11 matrix | Status-transition lookup helper given every (from, to) pair | Permitted pairs return `{allowed:true, requiresOwnership}`; all others return `{allowed:false}` | `server/tests/lab-03/status-transitions.unit.test.ts` | Pass |
| UNIT-03 | Unit | `api-spec.md` §4 | Queue query normalization given invalid `sort`/`order`/`page` and valid ones | Invalid values replaced by documented defaults; valid ones pass through | `server/tests/lab-03/queue-query.unit.test.ts` | Pass |
| UNIT-04 | Unit | BR-08, AC-25 | Login-throttle counter given 4, 5, and 6 failed attempts inside the window, then after cooldown | Allowed through attempt 5; 6th rejected; allowed again after cooldown elapses | `server/tests/lab-03/login-throttle.unit.test.ts` | Pass |
| API-01 | API | AC-01 | `POST /auth/login` with valid credentials | 200; identity + role + `mustChangePassword` returned; `sid` cookie set | `server/tests/lab-03/auth.api.test.ts` | Pass |
| API-02 | API | AC-05, BR-06 | `POST /auth/login` with unknown email vs. wrong password | Identical generic `401 INVALID_CREDENTIALS` message for both; the bcrypt comparison always runs against a fixed dummy hash for an unknown email, verified by code review rather than an automated timing assertion (flaky in CI) | `server/tests/lab-03/auth.api.test.ts` | Pass |
| API-03 | API | AC-06, BR-07 | `POST /auth/login` for an inactive account's correct credentials | Same generic message as API-02, not a distinct "inactive" response | `server/tests/lab-03/auth.api.test.ts` | Pass |
| API-04 | Security | AC-25, BR-08 | 6th failed login attempt for one email inside 15 minutes | `429 TOO_MANY_ATTEMPTS` | `server/tests/lab-03/auth.api.test.ts` | Pass |
| API-05 | API | AC-07 | `POST /auth/logout`, then reuse the old `sid` cookie on a protected route | Logout `200`; subsequent request `401 UNAUTHENTICATED` | `server/tests/lab-03/auth.api.test.ts` | Pass |
| API-06 | API | AC-08 | `GET /auth/me` authenticated | Returns id/name/email/role/`mustChangePassword` | `server/tests/lab-03/auth.api.test.ts` | Pass |
| API-07 | API | AC-02, BR-02 | `POST /auth/change-password` while `mustChangePassword` is true, with a valid new password | `mustChangePassword` becomes false; normal endpoints become reachable | `server/tests/lab-03/auth.api.test.ts` | Pass |
| API-08 | Security | AC-02, BR-02 | Any protected endpoint other than `/auth/me`, `/auth/logout`, `/auth/change-password`, called while `mustChangePassword` is true | `403 FORBIDDEN`, code `PASSWORD_CHANGE_REQUIRED` | `server/tests/lab-03/authorization.api.test.ts` | Pass |
| API-09 | Security | AC-09, BR-12 | `GET /api/tickets/:id` for a Ticket owned by a different Requester | `404 NOT_FOUND`, indistinguishable from a nonexistent id | `server/tests/lab-03/authorization.api.test.ts` | Pass |
| API-10 | Security | AC-03, BR-03 | `POST /api/tickets` with a `requesterId` in the body pointing at another Requester | Ticket is created under the *session's* Requester regardless of the body value | `server/tests/lab-03/authorization.api.test.ts` | Pass |
| API-11 | Security | AC-04, BR-04 | `GET /api/tickets/:id/notes` called by a Requester on their own Ticket | `403 FORBIDDEN`, no note content in the response | `server/tests/lab-03/authorization.api.test.ts` | Pass |
| API-12 | Security | BR-20 | `GET /api/staff/tickets` called by a Requester and by an Administrator | `403 FORBIDDEN` for both roles | `server/tests/lab-03/authorization.api.test.ts` | Pass |
| API-13 | Security | AC-22, BR-20 | `GET /api/users` called by IT Staff | `403 FORBIDDEN`, no user data returned | `server/tests/lab-03/authorization.api.test.ts` | Planned |
| API-14 | Security | `specification.md` §11 | `POST /api/staff/tickets/:id/claim` called by an Administrator | `403 FORBIDDEN` — Administrator performs no ticket actions | `server/tests/lab-03/authorization.api.test.ts` | Pass |
| API-15 | Security | AC-01 (inverse) | Any protected endpoint called with no `sid` cookie | `401 UNAUTHENTICATED` | `server/tests/lab-03/authorization.api.test.ts` | Pass |
| API-16 | API | AC-10 | `GET /api/staff/tickets` with search/status/itPriority/owner/sort/page params | Correct filtered/sorted subset and accurate pagination metadata | `server/tests/lab-03/staff-queue.api.test.ts` | Pass |
| API-17 | API | `api-spec.md` §4 | `GET /api/staff/tickets` with an invalid `sort`/`page` value | Falls back to the documented default, no error | `server/tests/lab-03/staff-queue.api.test.ts` | Pass |
| API-18 | API | `specification.md` §11 | `GET /api/staff/tickets` returns exactly the 7 documented columns | Response shape matches `api-spec.md` §4, no extra/missing fields | `server/tests/lab-03/staff-queue.api.test.ts` | Pass |
| API-19 | API | AC-11 | `POST /api/staff/tickets/:id/claim` on an unassigned `NEW` Ticket | Owner set to caller; status becomes `OPEN` | `server/tests/lab-03/staff-ticket-detail.api.test.ts` | Pass |
| API-20 | API | BR-13 | `POST /api/staff/tickets/:id/claim` on an already-assigned Ticket | `409 CONFLICT`, code `ALREADY_ASSIGNED` | `server/tests/lab-03/staff-ticket-detail.api.test.ts` | Pass |
| API-21 | API | BR-13 | `POST /api/staff/tickets/:id/reassign` to another active IT Staff member | Owner updates; status unchanged | `server/tests/lab-03/staff-ticket-detail.api.test.ts` | Pass |
| API-22 | Security | AC-12, BR-14 | `PATCH /api/staff/tickets/:id/status` by an IT Staff member who is not the current owner, on a transition that requires ownership | `403 FORBIDDEN`, code `NOT_TICKET_OWNER` | `server/tests/lab-03/staff-ticket-detail.api.test.ts` | Pass |
| API-23 | API | AC-13 | `PATCH /api/staff/tickets/:id/status` by the current owner, on a permitted transition | Status updates | `server/tests/lab-03/staff-ticket-detail.api.test.ts` | Pass |
| API-24 | API | AC-14 | `PATCH /api/staff/tickets/:id/status` requesting a transition not in the matrix | `409 CONFLICT`, code `INVALID_TRANSITION` | `server/tests/lab-03/staff-ticket-detail.api.test.ts` | Pass |
| API-25 | API | BR-15 | `PATCH /api/staff/tickets/:id/priority` by an IT Staff member who does not own the Ticket | Priority updates regardless of ownership | `server/tests/lab-03/staff-ticket-detail.api.test.ts` | Pass |
| API-26 | API | AC-17, BR-05 | `POST /api/tickets/:id/resolution-signal` by the owning Requester | `requesterConfirmedAt` set; `currentStatus` unchanged | `server/tests/lab-03/staff-ticket-detail.api.test.ts` | Pass |
| API-27 | API | AC-15, BR-04 | `POST` then `GET /api/tickets/:id/comments` as Requester, IT Staff, and Administrator | Comment visible to all three | `server/tests/lab-03/comments-notes.api.test.ts` | Pass |
| API-28 | API | AC-16, BR-04 | `POST` an Internal Note, then `GET` it as IT Staff, Administrator, and (via API-11) Requester | Visible to IT Staff/Administrator only | `server/tests/lab-03/comments-notes.api.test.ts` | Pass |
| API-29 | API | BR-16 | `POST` a comment/note that is empty, whitespace-only, or 2,001 characters | `400 VALIDATION_ERROR` in each case | `server/tests/lab-03/comments-notes.api.test.ts` | Pass |
| API-30 | Security | AC-26, BR-16 | `POST` a comment containing `<script>alert(1)</script>` | Stored and returned as literal text, no markup interpretation server-side | `server/tests/lab-03/comments-notes.api.test.ts` | Pass |
| API-31 | Security | AC-27, BR-26 | `GET /api/tickets/:id` (Requester's own Ticket Detail) response body inspected | No Internal Note field or content present anywhere in the payload | `server/tests/lab-03/comments-notes.api.test.ts` | Pass |
| API-32 | API | AC-18, BR-19 | `POST /api/users` with an email already in use | `409 CONFLICT`, code `EMAIL_ALREADY_EXISTS` | `server/tests/lab-03/users-admin.api.test.ts` | Planned |
| API-33 | API | AC-19 | `POST /api/users` with valid data | `201`; one-time `initialPassword` present in this response only | `server/tests/lab-03/users-admin.api.test.ts` | Planned |
| API-34 | API | AC-19 | New user (from API-33) logs in with the returned initial password | Login succeeds; `mustChangePassword: true` forces API-07's flow | `server/tests/lab-03/users-admin.api.test.ts` | Planned |
| API-35 | API | AC-20, BR-23 | `PATCH /api/users/:id` setting `isActive:false` on the caller's own account | `409 CONFLICT`, code `SELF_DEACTIVATION_BLOCKED` | `server/tests/lab-03/users-admin.api.test.ts` | Planned |
| API-36 | API | AC-21 | `PATCH /api/users/:id` deactivating, or changing the role of, the last active Administrator | `409 CONFLICT`, code `LAST_ACTIVE_ADMIN_BLOCKED` | `server/tests/lab-03/users-admin.api.test.ts` | Planned |
| API-37 | Security | AC-28, BR-22 | `PATCH /api/users/:id` body includes `passwordHash` and `mustChangePassword` alongside valid fields | Only name/email/role/isActive applied; extra fields silently ignored | `server/tests/lab-03/users-admin.api.test.ts` | Planned |
| API-38 | Security | AC-22 | `GET`/`POST`/`PATCH /api/users*` called by a Requester and by IT Staff | `403 FORBIDDEN` for both, no user data returned | `server/tests/lab-03/users-admin.api.test.ts` | Planned |
| API-39 | API | BR-13 | `GET /api/staff/assignable-users` as IT Staff, then as a Requester and an Administrator | Active IT Staff only, as `{id, name}`, inactive IT Staff excluded; `403 FORBIDDEN` for the other two roles | `server/tests/lab-03/staff-ticket-detail.api.test.ts` | Pass |
| API-40 | API | `api-spec.md` §4 | `GET /api/staff/attachments/:id/download` as IT Staff for an active and a soft-removed Attachment, then as a Requester | Active file served; removed `404 NOT_FOUND`; Requester `403 FORBIDDEN` | `server/tests/lab-03/staff-ticket-detail.api.test.ts` | Pass |
| API-41 | Security | AC-27, BR-26 | Post an Internal Note, then a Public Comment, reading the Ticket's `updatedAt` as the Requester after each | Unchanged after the Internal Note; later after the Public Comment | `server/tests/lab-03/comments-notes.api.test.ts` | Pass |
| API-42 | API | AC-17, BR-05 | `POST /api/tickets/:id/resolution-signal` twice on an open Ticket, then on a Closed and a Cancelled one | Second call keeps the first `requesterConfirmedAt`; Closed and Cancelled `409 CONFLICT`, code `TICKET_CLOSED` | `server/tests/lab-03/staff-ticket-detail.api.test.ts` | Pass |
| API-44 | API | FR-11 | `GET /api/staff/tickets/:id` as IT Staff, for a missing id, and as a Requester | Full Ticket with requester, owner and attachments and no comment or note fields; `404` for a missing id; `403` for a Requester | `server/tests/lab-03/staff-ticket-detail.api.test.ts` | Pass |
| API-43 | API | AC-11, BR-13 | Two IT Staff members claim the same unassigned `NEW` Ticket at the same time | Exactly one `200` and one `409 ALREADY_ASSIGNED`; the owner is the one that succeeded | `server/tests/lab-03/staff-ticket-detail.api.test.ts` | Pass |
| MIG-01 | Migration | AC-23, BR-24 | Run the Lab 2→3 migration against a copy of seeded Lab 2 data | Every Ticket/Attachment still references its correct original User; row counts match pre-migration | `server/tests/lab-03/migration.regression.test.ts` | Pass |
| MIG-02 | Migration | `specification.md` §11 | Migrated (pre-Lab-3) Requesters after the migration runs on a copy of Lab 2 data | Each keeps email and active state, has role `REQUESTER` and `mustChangePassword: true`, and its non-null `passwordHash` verifies against the documented initial password (logging in with it is API-level, Issue #35) | `server/tests/lab-03/migration.regression.test.ts` | Pass |
| MIG-03 | Migration | labsheet §5.3 | Run the seed script twice in a row | Second run makes no duplicate rows; identical row counts after each run | `server/tests/lab-03/migration.regression.test.ts` | Pass |
| MIG-04 | Migration | BR-12 (supersedes Lab 2) | Existing `server/tests/lab-02/ticket-detail.api.test.ts`, `attachments.api.test.ts`, `client/tests/lab-02/RequesterTicketDetail.test.tsx` | Updated on purpose to expect `404` instead of `403`; still pass | *(updated Lab 2 files, not new)* | Pass |
| UI-01 | UI | AC-05, AC-06 | Login component: invalid-credentials and busy states | Generic error shown; fields disabled + spinner while busy | `client/tests/lab-03/Login.test.tsx` | Pass |
| UI-02 | UI | AC-02, BR-10 | ChangePassword component: live rule checklist and Continue enablement | Continue disabled until all three rules + confirm-match are satisfied | `client/tests/lab-03/ChangePassword.test.tsx` | Pass |
| UI-03 | UI | AC-10 | StaffTicketQueue component: search/filter/sort/pagination controls, and empty/no-results states | List reflects each control; empty vs. no-results are visually distinct | `client/tests/lab-03/StaffTicketQueue.test.tsx` | Pass |
| UI-04 | UI | AC-12 | StaffTicketDetail component: status control when the viewer is not the Ticket's owner | Owner-required options rendered disabled with a tooltip, not hidden | `client/tests/lab-03/StaffTicketDetail.test.tsx` | Pass |
| UI-05 | UI | AC-26 | StaffTicketDetail component: a comment/note containing HTML-like text | Rendered as visible literal text, not executed | `client/tests/lab-03/StaffTicketDetail.test.tsx` | Pass |
| UI-06 | UI | AC-18, AC-20, AC-21 | UserManagement component: duplicate-email, self-deactivation, and last-admin attempts | Inline error specific to each case, not a generic failure banner | `client/tests/lab-03/UserManagement.test.tsx` | Planned |
| UI-07 | UI | AC-19 | UserManagement component: create and reset-password flows | One-time password callout shown once, not retrievable after dismissal | `client/tests/lab-03/UserManagement.test.tsx` | Planned |
| UI-08 | UI | AC-17 | Requester Ticket Detail: "Problem Appears Resolved" action | Confirmation shown; status badge unchanged after confirming | `client/tests/lab-03/RequesterTicketDetail.test.tsx` | Pass |
| UI-09 | UI | `ui-spec.md` §3 | AppShell navigation rendered for each of the three roles | Only that role's permitted links are present in the DOM, not just visually hidden | `client/tests/lab-02/AppShell.test.tsx` (the Lab 2 shell test, rewritten in #36) | Pass |
| STYLE-01 | UI Style | `ui-spec.md` §9 | Status/Priority/Role badge markup across Queue, Staff Ticket Detail, and User Management | Badge classes/colors match §9 for every value | `e2e/lab-03/ui-style.spec.ts` | Planned |
| STYLE-02 | UI Style | `ui-spec.md` §7 | Public Comment vs. Internal Note card markup on Staff Ticket Detail | Distinct classes/background applied per §7, never label-only | `e2e/lab-03/ui-style.spec.ts` | Planned |
| STYLE-03 | UI Style | `ui-spec.md` §9, §14 | Status/role → badge class mapping, and `theme.css` read as text | All 8 statuses and 3 roles map to §14's class names, and every one of those classes has a CSS rule | `client/tests/lab-03/badge-classes.test.ts` | Pass |
| RESP-01 | Responsive | AC-24 | Screenshots of Login/ChangePassword, Staff Queue, Staff Ticket Detail, User Management at desktop/tablet/mobile, written to `artifacts/lab-03/screenshots/` per labsheet §12 | No clipping, overlap, or unintended horizontal scroll at any width | `e2e/lab-03/responsive.spec.ts` | Planned |
| A11Y-01 | Accessibility | `ui-spec.md` §11 | Keyboard only, no mouse: Login, Change Password, Queue search/filter/sort/pagination, Staff Ticket Detail owner/IT Priority/status controls and comment/note composers, User Management list and panel | Every control reachable with Tab, operable with Enter/Space/arrow keys, with a visible focus indicator | `e2e/lab-03/accessibility.spec.ts` | Planned |
| E2E-01 | E2E | AC-01, AC-02, AC-07 | Log in with an initial password, forced change, reach the app, log out, attempt to revisit a protected URL | Change required before entry; app reachable after; blocked after logout (verified against the session cookie directly — no client-side protected route exists until #36) | `e2e/lab-03/authentication.spec.ts` | Pass |
| E2E-02 | E2E | AC-11, AC-13, AC-15, AC-16 | IT Staff claims an unassigned Ticket, sets IT Priority, posts a Public Comment and an Internal Note, transitions status through the permitted matrix | Ownership, priority, comments/notes, and status all reflect correctly end-to-end | `e2e/lab-03/staff-ticket-flow.spec.ts` | Pass |
| E2E-03 | E2E | AC-18, AC-19, AC-20, AC-21 | Administrator creates a user (one role + initial password), the new user logs in and is forced to change it, Administrator edits another user, then attempts self-deactivation and last-admin deactivation | Create/edit succeed; both blocked attempts show the specific error, not a generic one | `e2e/lab-03/user-administration.spec.ts` | Planned |

`password-rules.unit.test.ts`, `status-transitions.unit.test.ts`, `queue-query.unit.test.ts`,
`login-throttle.unit.test.ts`, `migration.regression.test.ts`, `AppShell.test.tsx`,
`RequesterTicketDetail.test.tsx` (Lab 3 additions), `badge-classes.test.ts`, `ui-style.spec.ts`,
`responsive.spec.ts`, and `accessibility.spec.ts` are not in the labsheet's §12 minimum file list, which the labsheet itself
labels a *minimum*. They exist because the password rule, the status matrix, the queue's
degrade-gracefully behavior, login throttling, migration/regression evidence, role-scoped
navigation, the Requester's resolution signal, the UI-style/responsive checks, and keyboard
accessibility are all labsheet requirements that need a
home to be tested at all — the same reasoning `docs/lab-02/tests.md` used for its own extra files.

## 3. Acceptance-Criterion Traceability

| AC | Tests |
|---|---|
| AC-01 | API-01, E2E-01 |
| AC-02 | API-07, API-08, UI-02, E2E-01 |
| AC-03 | API-10 |
| AC-04 | API-11 |
| AC-05 | API-02, UI-01 |
| AC-06 | API-03, UI-01 |
| AC-07 | API-05, E2E-01 |
| AC-08 | API-06 |
| AC-09 | API-09 |
| AC-10 | API-16, UI-03 |
| AC-11 | API-19, API-43, E2E-02 |
| AC-12 | API-22, UI-04 |
| AC-13 | API-23, E2E-02 |
| AC-14 | API-24 |
| AC-15 | API-27, E2E-02 |
| AC-16 | API-28, E2E-02 |
| AC-17 | API-26, API-42, UI-08 |
| AC-18 | API-32, UI-06, E2E-03 |
| AC-19 | API-33, API-34, UI-07, E2E-03 |
| AC-20 | API-35, UI-06, E2E-03 |
| AC-21 | API-36, UI-06, E2E-03 |
| AC-22 | API-13, API-38 |
| AC-23 | MIG-01 |
| AC-24 | RESP-01 |
| AC-25 | API-04, UNIT-04 |
| AC-26 | API-30, UI-05 |
| AC-27 | API-31, API-41 |
| AC-28 | API-37 |

Every AC in `specification.md` §9 maps to at least one test above.

## 4. Responsive and Visual Checklist

Executed as part of RESP-01 and STYLE-01/02, and again by hand once all Lab 3 screens are built.
The checklist itself is defined once, in `ui-spec.md` §12, so it is not duplicated here.

## 5. Test Commands

- Server: `npm test` inside `server/`
- Client: `npm test` inside `client/`
- E2E, UI style and responsive: `npm test` inside `e2e/`. The Playwright config starts both dev
  servers itself; PostgreSQL must already be running.

## 6. Final Results

Every row above starts **Planned**. A row moves to **Pass** once its test exists and passes on its
feature branch, and is re-verified on `main` before submission — this table is updated as each
Issue merges, not written once at the end.

## 7. Known Limitations or Deferred Tests

- Actions Taken, SLA/escalation, dashboards, and email delivery are out of scope per
  `specification.md` §3 and have no tests here.
- Login-throttle state (BR-08) is assumed in-memory/per-process for Lab 3's single-server local
  setup; multi-instance throttle sharing is out of scope.
