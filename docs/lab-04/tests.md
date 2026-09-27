# Lab 4 Test Plan and Results

## 1. Test Strategy

Tests are written before the code they cover. For each Issue the failing tests are committed first,
seen to fail for the expected reason, and then the smallest correct implementation makes them
pass. A PR is not merged with a skipped, disabled, flaky or unmapped test. Labsheet §10 names ten
coverage types for Lab 4: unit, API or integration, UI component, UI style, responsive,
authorization, workflow, migration/regression, performance smoke and end to end. Each has its own
`Type` value below, plus keyboard accessibility. The whole suite, including every Lab 1 to 3
test, is run again on `main` after the release PR, and that run is the Part 3 evidence.

Rule numbers (FR, BR, AC) refer to `docs/lab-04/specification.md`. Test ids restart at 01 for
Lab 4, like the requirement ids.

## 2. Planned Tests

| Test ID | Type | Requirement / AC | What It Tests | Expected Result | Automated Test File | Final |
|---|---|---|---|---|---|---|
| UNIT-01 | Unit | AC-08, BR-09 | Action status rule helper for every (from, to) pair | Only BR-09 moves allowed; Completed and Cancelled allow none | `server/tests/lab-04/action-rules.unit.test.ts` | Pass |
| UNIT-02 | Unit | AC-07, BR-06, BR-07, BR-08 | Action validator at its boundaries: date before Ticket creation, 5 min in future, 2,000 / 2,001 chars, Completed without result, follow up without note | Each violation reported on its own field; valid input passes | `server/tests/lab-04/action-rules.unit.test.ts` | Pass |
| UNIT-03 | Unit | AC-14, BR-16 | Resolution gate helper with 0 Actions, only Cancelled, 1 Completed + 1 Planned, 1 Completed + 1 In Progress, 2 Completed + 1 Cancelled | Met only in the last case; counts returned | `server/tests/lab-04/resolution-gate.unit.test.ts` | Pass |
| UNIT-04 | Unit | AC-21, BR-21, BR-26 | Dashboard filter and link builders | Active status list and every link match BR-26 exactly | `server/tests/lab-04/dashboard-queries.unit.test.ts` | Pass |
| API-01 | Authorization | AC-05, BR-03 | `GET /tickets/:id/actions` as owning Requester, other Requester, IT Staff, Administrator, missing Ticket | Own: full list; other: `404`; staff and admin: list; missing: `404` | `server/tests/lab-04/actions-taken.api.test.ts` | Pass |
| API-02 | Authorization | AC-04, BR-03 | Requester calls `POST /staff/tickets/:id/actions` and `PATCH /staff/actions/:id` on their own Ticket | `403`, no row written or changed | `server/tests/lab-04/actions-taken.api.test.ts` | Pass |
| API-03 | API | AC-01 | Create a valid Action Taken | Created under the correct Ticket and actor, with the approved assignee | `server/tests/lab-04/actions-taken.api.test.ts` | Pass |
| API-04 | API | AC-06, BR-05 | Create with an inactive IT Staff assignee, a Requester assignee, an unknown id | `400 ASSIGNEE_INACTIVE`, `400 ASSIGNEE_INVALID`, `400 ASSIGNEE_INVALID` | `server/tests/lab-04/actions-taken.api.test.ts` | Pass |
| API-05 | API | AC-07 | Create with missing description, Completed without result, follow up without note, future date | `400 VALIDATION_ERROR` naming each field | `server/tests/lab-04/actions-taken.api.test.ts` | Pass |
| API-06 | Workflow | AC-08, BR-09 | PATCH Planned → In Progress → Completed, then any change; Planned → Cancelled, then any change; In Progress → Planned | Permitted moves `200`; after final state `409 ACTION_LOCKED`; backwards move `409 INVALID_TRANSITION` | `server/tests/lab-04/actions-taken.api.test.ts` | Pass |
| API-07 | API | AC-09, BR-02 | Two IT Staff members who do not own the Ticket each add Actions with different dates | Both saved with their own Performed By; list ordered by Action Date/Time then id | `server/tests/lab-04/actions-taken.api.test.ts` | Pass |
| API-08 | Workflow | AC-10, BR-10 | Create and update on a Closed and on a Cancelled Ticket | `409 TICKET_CLOSED` each time | `server/tests/lab-04/actions-taken.api.test.ts` | Pass |
| API-09 | API | AC-11, BR-20 | Same create sent twice with one `clientRequestId`, then once with a new id | First `201`, repeat `200` with the same id, new id `201`; exactly 2 rows | `server/tests/lab-04/actions-taken.api.test.ts` | Pass |
| API-10 | API | AC-12, BR-19 | PATCH an Action with its current version, then again with the old version | First `200` and version + 1; second `409 STALE_UPDATE`, row unchanged | `server/tests/lab-04/actions-taken.api.test.ts` | Pass |
| API-11 | Authorization | AC-01, BR-04 | Create with `performedById` of another user in the body, then PATCH trying to change it | Performed By is always the session user and never changes | `server/tests/lab-04/actions-taken.api.test.ts` | Pass |
| API-12 | Workflow | AC-13, BR-19 | Claim, reassign, priority and status each sent with a stale `expectedVersion`, and once without it | `409 STALE_UPDATE` and Ticket unchanged; missing version `400` | `server/tests/lab-04/ticket-workflow.api.test.ts` | Pass |
| API-13 | Workflow | AC-14, BR-16 | Owner requests Resolved directly with 0 Actions, with 1 Completed + 1 Planned, with only Cancelled | `409 RESOLUTION_GATE_NOT_MET` with counts; status unchanged | `server/tests/lab-04/ticket-workflow.api.test.ts` | Pass |
| API-14 | Workflow | AC-15, BR-18 | Owner resolves a Ticket meeting the gate | `200`, status Resolved, version + 1, one history row In Progress → Resolved | `server/tests/lab-04/ticket-workflow.api.test.ts` | Pass |
| API-15 | Authorization | AC-16, BR-13 | Administrator: queue, claim, reassign to IT Staff, set priority, change status, post a note, add an Action; reassign to an Administrator | All succeed as for IT Staff | `server/tests/lab-04/ticket-workflow.api.test.ts` | Pass |
| API-16 | Workflow | AC-17, BR-15 | Every status pair outside the matrix | `409 INVALID_TRANSITION` | `server/tests/lab-04/ticket-workflow.api.test.ts` | Pass |
| API-17 | Workflow | AC-18, BR-18 | Three status changes, then read history as staff, owning Requester, other Requester; try PATCH and DELETE on history | Rows in change order; other Requester `404`; no write route (`404`) | `server/tests/lab-04/ticket-workflow.api.test.ts` | Pass |
| API-18 | Regression | AC-19, BR-17 | Requester sends "Problem Appears Resolved" on an In Progress Ticket | Status and version unchanged; signal recorded | `server/tests/lab-04/ticket-workflow.api.test.ts` | Pass |
| API-19 | Workflow | AC-13, BR-19 | Two status changes sent at once with the same version | Exactly one `200` and one `409 STALE_UPDATE` | `server/tests/lab-04/ticket-workflow.api.test.ts` | Pass |
| API-20 | Authorization | AC-02, BR-22 | Requester dashboard for two Requesters with different Tickets | Each sees only figures and Tickets they own | `server/tests/lab-04/requester-dashboard.api.test.ts` | Pass |
| API-21 | API | AC-23, BR-25 | Requester dashboard for a Requester with no Tickets | All figures `0`, both lists empty | `server/tests/lab-04/requester-dashboard.api.test.ts` | Pass |
| API-22 | Authorization | AC-22 | Requester dashboard as IT Staff and Administrator; Staff dashboard as Requester | `403` in each case, no figures returned | `server/tests/lab-04/requester-dashboard.api.test.ts` | Pass |
| API-23 | API | AC-21, BR-23, BR-26 | Every Staff dashboard figure compared with the same query run directly through Prisma | Every figure equal | `server/tests/lab-04/staff-dashboard.api.test.ts` | Pass |
| API-24 | Authorization | AC-22 | Staff dashboard as IT Staff and as Administrator | `userCounts` absent for IT Staff, present and correct for Administrator | `server/tests/lab-04/staff-dashboard.api.test.ts` | Pass |
| API-25 | API | AC-24 | Follow each card's `link` as a list request (`statusGroup`, `owner`, `itPriority`, `status`, `currentStatus`) | List `totalCount` / `totalItems` equals the card's count | `server/tests/lab-04/staff-dashboard.api.test.ts` | Pass |
| API-26 | API | AC-23, BR-25 | Staff dashboard for a staff member who owns nothing and has no Actions | Personal figures `0`; `byStatus` has 8 rows and `byItPriority` 3, zeros included | `server/tests/lab-04/staff-dashboard.api.test.ts` | Pass |
| PERF-01 | Performance smoke | AC-32 | Both dashboard endpoints on seeded data, timed | Each responds within 1 second | `server/tests/lab-04/dashboard-perf.smoke.test.ts` | Pass |
| MIG-01 | Migration | AC-25 | Row counts and sample rows of Users, Tickets, Attachments, comments, notes before and after the Lab 4 migration | Identical; every Ticket version 0, no Actions, no history; the documented rollback removes only the Lab 4 tables and column, and the migration re-applies | `server/tests/lab-04/migration.regression.test.ts` | Pass |
| MIG-02 | Migration | AC-26 | Run the seed twice | Identical counts; Tickets with 0, 1 and several Actions; every Action status present; seeded Resolved Tickets meet the gate | `server/tests/lab-04/migration.regression.test.ts` | Pass |
| REG-01 | Regression | AC-29 | Every Lab 1, 2 and 3 server and client test | All pass, apart from REG-02. The two Lab 3 Ticket Detail suites' mocked servers also answer the new Actions endpoint with an empty list (#61), since both pages now show Actions Taken; no Lab 3 assertion changed | `server/tests/lab-0{1,2,3}/`, `client/tests/lab-0{1,2,3}/` | Planned |
| REG-02 | Regression | AC-29, Section 11 | Lab 2 and 3 tests whose contract Lab 4 changes on purpose (#62): Administrator access (Lab 3 API-12, API-14, comment and note posting, assignable users, the Administrator navigation), `expectedVersion` on every Ticket write (Lab 3 staff detail API and UI suites, including API-43 whose losing claim is now `STALE_UPDATE`), the "Ticket Queue" link name, Lab 3 E2E-02 recording a Completed Action before resolving, and (#63) every Lab 2 and 3 E2E sign-in waiting for the new Dashboard landing page before opening the screen it tests | Updated on purpose, each change commented in the test and explained in the #62 PR; all pass | `server/tests/lab-03/authorization.api.test.ts`, `comments-notes.api.test.ts`, `staff-ticket-detail.api.test.ts`, `client/tests/lab-02/AppShell.test.tsx`, `client/tests/lab-03/StaffTicketDetail.test.tsx`, `e2e/lab-02/auth-helper.ts`, `e2e/lab-03/*.spec.ts` | Pass |
| UI-01 | UI | AC-02, AC-23 | RequesterDashboard: cards with links, recent lists, empty text, loading, safe failure with Retry | Matches `ui-spec.md` §3 and §4 | `client/tests/lab-04/RequesterDashboard.test.tsx` | Pass |
| UI-02 | UI | AC-21, AC-22 | StaffDashboard: cards, By Status and By IT Priority links, My Open Actions, User Accounts only for Administrator, loading, failure | Matches `ui-spec.md` §3 and §5 | `client/tests/lab-04/StaffDashboard.test.tsx` | Pass |
| UI-03 | UI | AC-07, AC-30 | Action form: messages under each field; server failure keeps typed input | Matches `ui-spec.md` §7 feedback table | `client/tests/lab-04/ActionsTaken.test.tsx` | Pass |
| UI-04 | UI | AC-31 | Action form: double click Save, then a retry after a failure | One request while pending; retry reuses the same `clientRequestId` | `client/tests/lab-04/ActionsTaken.test.tsx` | Pass |
| UI-05 | UI | AC-08 | Completed and Cancelled Actions open read only; cancelling asks for confirmation | No Save button on locked Actions; confirm dialog shown | `client/tests/lab-04/ActionsTaken.test.tsx` | Pass |
| UI-06 | UI | AC-12 | `409 STALE_UPDATE` on Action save | Warning banner with Reload; typed values kept | `client/tests/lab-04/ActionsTaken.test.tsx` | Pass |
| UI-07 | UI | AC-20 | Status control with the gate met and not met, as owner and not owner | Only permitted moves; Resolved disabled with the §8 reason when not met | `client/tests/lab-04/TicketWorkflow.test.tsx` | Pass |
| UI-08 | UI | AC-13, AC-14 | Status change answered with `RESOLUTION_GATE_NOT_MET`, then `STALE_UPDATE` | Banner with Reload; displayed status unchanged | `client/tests/lab-04/TicketWorkflow.test.tsx` | Pass |
| UI-09 | UI | AC-24 | My Tickets and Ticket Queue opened with filters in the URL, then a control changed | Filters applied from the URL, "Active statuses" chip shown, URL updated | `client/tests/lab-04/UrlFilters.test.tsx` | Pass |
| UI-10 | UI | AC-05 | Requester Ticket Detail with Actions and history | Read only list including Cancelled Actions, no form or buttons | `client/tests/lab-04/ActionsTaken.test.tsx` | Pass |
| STYLE-01 | UI Style | `ui-spec.md` §11 | Action status badge and follow up flag class map, and `theme.css` read as text | Every value maps to its class and every class has a CSS rule | `client/tests/lab-04/action-badge-classes.test.ts` | Pass |
| STYLE-02 | UI Style | `ui-spec.md` §3, §7 | Rendered dashboard cards and Actions table: label, number, accessible link name, badge classes, read only styling of locked Actions | Classes and computed styles match the spec | `e2e/lab-04/ui-style.spec.ts` | Planned |
| RESP-01 | Responsive | AC-27 | Both dashboards and Actions Taken (list and form) at 1280, 768, 375 px, saved to `artifacts/lab-04/screenshots/` | No horizontal scroll, clipping or overlap | `e2e/lab-04/responsive.spec.ts` | Planned |
| A11Y-01 | Accessibility | AC-28 | Keyboard only: dashboard cards and links, Action panel open, fill, save, close, status control | Every control reachable and operable, focus visible and returned to Add Action | `e2e/lab-04/accessibility.spec.ts` | Planned |
| E2E-01 | E2E | AC-01, AC-06, AC-09 | Staff A adds an Action assigned to Staff B, is refused an inactive assignee, Staff B adds another, completes one, cancels one | Several Actions on one Ticket with the right people and statuses | `e2e/lab-04/actions-taken-flow.spec.ts` | Pass |
| E2E-02 | E2E | AC-03 | Owner tries to resolve with an open Action, completes it, resolves; Requester then views the Ticket | Refused with the reason, then Resolved; Requester sees Resolved, the Actions and the history | `e2e/lab-04/ticket-resolution.spec.ts` | Pass |
| E2E-03 | E2E | AC-02, AC-21, AC-24 | Requester and IT Staff sign in, land on their dashboards, follow a card | Figures shown; list opens filtered with a total equal to the card | `e2e/lab-04/dashboards.spec.ts` | Pass |
| E2E-04 | Regression | AC-29 | Every Lab 2 and Lab 3 Playwright spec | All pass | `e2e/lab-02/`, `e2e/lab-03/` | Planned |

Files beyond the labsheet's §12 minimum (`action-rules`, `resolution-gate`, `dashboard-queries`,
`dashboard-perf`, `migration.regression`, `UrlFilters`, `action-badge-classes`, `ui-style`,
`responsive`, `accessibility`) exist because the rules they test are labsheet requirements that
need a home; §12 calls its list a minimum.

## 3. Acceptance Criterion Traceability

| AC | Tests |
|---|---|
| AC-01 | API-03, API-11, E2E-01 |
| AC-02 | API-20, UI-01, E2E-03 |
| AC-03 | E2E-02 |
| AC-04 | API-02 |
| AC-05 | API-01, UI-10 |
| AC-06 | API-04, E2E-01 |
| AC-07 | UNIT-02, API-05, UI-03 |
| AC-08 | UNIT-01, API-06, UI-05 |
| AC-09 | API-07, E2E-01 |
| AC-10 | API-08 |
| AC-11 | API-09 |
| AC-12 | API-10, UI-06 |
| AC-13 | API-12, API-19, UI-08 |
| AC-14 | UNIT-03, API-13, UI-08 |
| AC-15 | API-14 |
| AC-16 | API-15 |
| AC-17 | API-16 |
| AC-18 | API-17 |
| AC-19 | API-18 |
| AC-20 | UI-07 |
| AC-21 | UNIT-04, API-23, UI-02, E2E-03 |
| AC-22 | API-22, API-24, UI-02 |
| AC-23 | API-21, API-26, UI-01 |
| AC-24 | API-25, UI-09, E2E-03 |
| AC-25 | MIG-01 |
| AC-26 | MIG-02 |
| AC-27 | RESP-01 |
| AC-28 | A11Y-01 |
| AC-29 | REG-01, REG-02, E2E-04 |
| AC-30 | UI-03 |
| AC-31 | UI-04 |
| AC-32 | PERF-01 |

Every AC in `specification.md` §9 maps to at least one test.

## 4. Responsive and Visual Checklist

Run by RESP-01 and STYLE-01/02, then by eye once every Lab 4 screen exists. The checklist is kept
once, in `ui-spec.md` §15.

## 5. Test Commands

- Server: `npm test` inside `server/` (files run one at a time against the local database)
- Client: `npm test` inside `client/`
- E2E, UI style, responsive and accessibility: `npm test` inside `e2e/`; Playwright starts both
  dev servers, PostgreSQL must already be running

## 6. Final Results

Every row starts **Planned**. A row becomes **Pass** when its test exists and passes on its feature
branch, and is checked again on `main` before submission.

## 7. Known Limitations

- The resolution gate and stale update checks rely on PostgreSQL transactions on the one local
  server; multi instance behavior is out of scope (labsheet §4.2).
- PERF-01 is a smoke check on seeded data, not a load test.
