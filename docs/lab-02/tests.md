# Lab 2 Test Plan and Results

## 1. Test Strategy

Tests are written before implementation, per Issue: each Issue's failing tests are committed
first, confirmed to fail for the expected reason, then the smallest correct implementation makes
them pass. A PR is not merged with a skipped, disabled, or unrelated test. The full suite —
unit, API, UI component, UI style, responsive, and E2E — is re-run on `main` after the release
PR, and that final run is the evidence submitted for Part 3.

## 2. Planned Tests

| Test ID | Type | Requirement / AC | What It Tests | Expected Result | Automated Test File | Final |
|---|---|---|---|---|---|---|
| UNIT-01 | Unit | BR-01, FR-05 | Ticket Number formatting helper, given a year and a sequence number | Matches `TKT-<year>-<6 digits>`, zero-padded; sequence uniqueness comes from the database sequence and is covered by API-01 | `server/tests/lab-02/ticket-number-generator.unit.test.ts` | Pass |
| UNIT-02 | Unit | BR-27 | Attachment validation helper given a file failing several checks at once | Returns only the first failing check in BR-27's order | `server/tests/lab-02/attachment-validation.unit.test.ts` | Pass |
| UNIT-03 | Unit | BR-11 | Summary/Description trim-and-length logic at its boundaries | Trimmed; 5-120 and 10-2000 enforced inclusively | `server/tests/lab-02/ticket-field-validation.unit.test.ts` | Pass |
| UNIT-04 | Unit | `api-spec.md` §4, BR-10 | Ticket-list query normalization given invalid `sort`, `order`, `page`, `pageSize`, and given valid ones | Each invalid value replaced by its documented default and each valid value passed through, with no error thrown | `server/tests/lab-02/ticket-list-query.unit.test.ts` | Pass |
| API-01 | API | AC-01 | `POST /api/tickets` with valid data | 201; Ticket saved; Ticket Number returned in the correct format | `server/tests/lab-02/create-ticket.api.test.ts` | Pass |
| API-02 | API | AC-09, AC-10 | `POST /api/tickets` with a missing or out-of-range field | 400 with every failing field listed | `server/tests/lab-02/create-ticket.api.test.ts` | Pass |
| API-03 | API | BR-04 | `POST /api/tickets` body includes client-supplied `ticketNumber`/`ticketDate`/`currentStatus` | Server-assigned values are used regardless | `server/tests/lab-02/create-ticket.api.test.ts` | Pass |
| API-04 | API | AC-15, BR-08 | `GET /api/tickets` as Requester A, then as Requester B | Each response contains only that Requester's own Tickets | `server/tests/lab-02/my-tickets.api.test.ts` | Pass |
| API-05 | API | AC-18, AC-19, AC-20 | `GET /api/tickets` with search/filter/sort/page params, including `sort=updatedAt` | Correct subset, order, and pagination metadata | `server/tests/lab-02/my-tickets.api.test.ts` | Pass |
| API-06 | API | BR-10 | `GET /api/tickets` with an invalid `sort`/`page`/`pageSize` | Falls back to documented defaults, no error | `server/tests/lab-02/my-tickets.api.test.ts` | Pass |
| API-07 | API | AC-16, AC-17 | `GET /api/tickets` for a Requester with none, and a non-matching search | 200, empty `data`, `totalItems: 0` in both cases | `server/tests/lab-02/my-tickets.api.test.ts` | Pass |
| API-08 | API | AC-21 | `GET /api/tickets/:id` for an owned Ticket | 200 with full detail, including attachments | `server/tests/lab-02/ticket-detail.api.test.ts` | Pass |
| API-09 | API | AC-03, BR-22 | `GET /api/tickets/:id` for another Requester's Ticket | 403, no Ticket data in the response | `server/tests/lab-02/ticket-detail.api.test.ts` | Pass |
| API-10 | API | BR-22 | `GET /api/tickets/:id` for a nonexistent id | 404 | `server/tests/lab-02/ticket-detail.api.test.ts` | Pass |
| API-11 | API | AC-13, BR-15 | Upload a disallowed type / an oversized file | 415 / 413; no attachment created | `server/tests/lab-02/attachments.api.test.ts` | Pass |
| API-12 | API | AC-14, BR-15 | Upload a 6th attachment to a Ticket already at 5 active | 409; sixth attachment rejected | `server/tests/lab-02/attachments.api.test.ts` | Pass |
| API-13 | API | AC-22 | Upload a valid attachment to an owned Ticket | 201; appears active in metadata | `server/tests/lab-02/attachments.api.test.ts` | Pass |
| API-14 | API | AC-23, BR-16, BR-17 | Soft-remove an owned attachment with a reason | 200; `isActive: false`, `removedAt`/`removalReason` stored | `server/tests/lab-02/attachments.api.test.ts` | Pass |
| API-15 | API | AC-24, BR-16 | Download a removed attachment | 404; file not returned | `server/tests/lab-02/attachments.api.test.ts` | Pass |
| API-16 | API | BR-18 | Upload/remove an attachment on a Ticket not owned by the caller | 403 | `server/tests/lab-02/attachments.api.test.ts` | Pass |
| API-17 | API | BR-19 | Ticket created successfully, a following attachment upload fails | Ticket remains saved; failure reported per-file, not rolled back | `server/tests/lab-02/create-ticket.api.test.ts` | Pass |
| API-18 | API | AC-05, BR-06 | `GET /api/requesters` with an inactive Requester seeded | Inactive Requester excluded | `server/tests/lab-02/requesters.api.test.ts` | Pass |
| API-19 | API | AC-28, BR-26 | Attachment database write fails after the file has been stored | Error returned; no orphaned file on disk; no Attachment row; Ticket unchanged | `server/tests/lab-02/attachments.api.test.ts` | Pass |
| API-20 | API | AC-29, BR-27 | Upload one file that is both a disallowed type and over 5 MB | Single `415`; `413` not returned | `server/tests/lab-02/attachments.api.test.ts` | Pass |
| API-21 | API | BR-28 | Upload then soft-remove an attachment, comparing the Ticket's `updatedAt` each time | Bumped by both actions; `ticketDate` unchanged | `server/tests/lab-02/attachments.api.test.ts` | Pass |
| UI-01 | UI | AC-04, AC-05, AC-06 | RequesterSelector loading / empty / API-failure states | Correct state per condition; Continue disabled while loading | `client/tests/lab-02/RequesterSelector.test.tsx` | Pass |
| UI-02 | UI | AC-26 | RequesterSelector keyboard-only navigation | Every control reachable and usable without a mouse | `e2e/lab-02/keyboard-nav.spec.ts` | Pass |
| UI-03 | UI | AC-02, AC-07, AC-08 | AppShell with no Requester, then after selecting/switching | Selector shown when none selected; name shown after; data reloads on switch | `client/tests/lab-02/AppShell.test.tsx` | Pass |
| UI-04 | UI | AC-09, AC-10 | CreateTicket submitted with a missing/invalid field | Field-level message shown; no API call made | `client/tests/lab-02/CreateTicket.test.tsx` | Pass |
| UI-05 | UI | AC-11 | CreateTicket Submit clicked | Busy state, button disabled, no duplicate call on repeat click | `client/tests/lab-02/CreateTicket.test.tsx` | Pass |
| UI-06 | UI | AC-12 | CreateTicket API call rejected | Safe error shown; field values remain in the form | `client/tests/lab-02/CreateTicket.test.tsx` | Pass |
| UI-07 | UI | AC-13 | CreateTicket given a disallowed attachment | Inline rejection next to that file; not added to the upload list | `client/tests/lab-02/CreateTicket.test.tsx` | Pass |
| UI-08 | UI | AC-01, AC-27 | CreateTicket successful submission | Success state shows the returned Ticket Number; Requester field shown during entry matches the currently selected Requester | `client/tests/lab-02/CreateTicket.test.tsx` | Pass |
| UI-09 | UI | AC-16, AC-17 | MyTickets with zero Tickets, then a non-matching search | Empty and no-results states are visually and textually distinct | `client/tests/lab-02/MyTickets.test.tsx` | Pass |
| UI-10 | UI | AC-18, AC-19, AC-20 | MyTickets pagination, sort, and filter controls | List updates to match each control's selection | `client/tests/lab-02/MyTickets.test.tsx` | Pass |
| UI-11 | UI | AC-15 | MyTickets after a simulated Requester switch | Previous Requester's rows no longer present | `client/tests/lab-02/MyTickets.test.tsx` | Pass |
| UI-12 | UI | AC-21 | RequesterTicketDetail with a fetched Ticket | All fields render read-only, no editable controls | `client/tests/lab-02/RequesterTicketDetail.test.tsx` | Pass |
| UI-13 | UI | BR-22 | RequesterTicketDetail given a 403/404 response | Safe message shown, no partial Ticket data rendered | `client/tests/lab-02/RequesterTicketDetail.test.tsx` | Pass |
| UI-14 | UI | AC-22, AC-23 | AttachmentSection add and soft-remove actions | New attachment appears active; removed one shows as removed metadata | `client/tests/lab-02/AttachmentSection.test.tsx` | Pass |
| UI-15 | UI | AC-24 | AttachmentSection given a removed attachment | Download control absent/disabled for it | `client/tests/lab-02/AttachmentSection.test.tsx` | Pass |
| STYLE-01 | UI Style | ui-spec.md §18 | Required CSS classes, asterisks, field states, button states on Create Ticket | All required classes/attributes present as rendered | `e2e/lab-02/ui-style.spec.ts` | Pass |
| STYLE-02 | UI Style | `ui-spec.md` §12 | Requested Priority and Current Status badge markup on My Tickets | Badge classes/colors match §12 for every value | `e2e/lab-02/ui-style.spec.ts` | Pass |
| RESP-01 | Responsive | AC-25 | Screenshots of Create Ticket, My Tickets, Ticket Detail at desktop/tablet/mobile, written to `artifacts/lab-02/screenshots/{create-ticket,my-tickets,ticket-detail}/` per labsheet §12 | No clipping, overlap, or unintended horizontal scroll at any width | `e2e/lab-02/responsive.spec.ts` | Pass |
| E2E-01 | E2E | AC-01, AC-07 | Select a Requester, create a Ticket, find it in My Tickets | Ticket appears with the confirmed Ticket Number | `e2e/lab-02/requester-ticket-flow.spec.ts` | Pass |
| E2E-02 | E2E | AC-03, AC-15 | Requester A creates a Ticket; switch to B; attempt direct access to A's Ticket | Not in B's list; direct access rejected | `e2e/lab-02/requester-ticket-flow.spec.ts` | Pass |
| E2E-03 | E2E | AC-22, AC-23, AC-24 | Add an attachment, soft-remove it, attempt to download it | Added, then shown removed, then download blocked | `e2e/lab-02/requester-ticket-flow.spec.ts` | Pass |

`ticket-number-generator.unit.test.ts`, `ticket-list-query.unit.test.ts`, `requesters.api.test.ts`,
`RequesterSelector.test.tsx`, `AppShell.test.tsx`, `ui-style.spec.ts` and `responsive.spec.ts` are not named in the labsheet's
minimum §12 file list, which the labsheet itself labels a *minimum*. They exist because the
Requester Selection screen, the Ticket Number rule, and the UI-style/responsive checks in §8.8
are all labsheet requirements with acceptance criteria that need a home to be tested at all.

## 3. Acceptance-Criterion Traceability

| AC | Tests |
|---|---|
| AC-01 | API-01, UI-08, E2E-01 |
| AC-02 | UI-03 |
| AC-03 | API-09, E2E-02 |
| AC-04 | UI-01 |
| AC-05 | UI-01, API-18 |
| AC-06 | UI-01 |
| AC-07 | UI-03, E2E-01 |
| AC-08 | UI-03 |
| AC-09 | API-02, UI-04 |
| AC-10 | API-02, UI-04 |
| AC-11 | UI-05 |
| AC-12 | UI-06 |
| AC-13 | API-11, UI-07 |
| AC-14 | API-12 |
| AC-15 | API-04, UI-11, E2E-02 |
| AC-16 | API-07, UI-09 |
| AC-17 | API-07, UI-09 |
| AC-18 | API-05, UI-10 |
| AC-19 | API-05, UI-10 |
| AC-20 | API-05, UI-10 |
| AC-21 | API-08, UI-12 |
| AC-22 | API-13, UI-14, E2E-03 |
| AC-23 | API-14, UI-14, E2E-03 |
| AC-24 | API-15, UI-15, E2E-03 |
| AC-25 | RESP-01 |
| AC-26 | UI-02 |
| AC-27 | UI-08 |
| AC-28 | API-19 |
| AC-29 | API-20, UNIT-02 |

Every AC in `specification.md` §9 maps to at least one test above.

## 4. Responsive and Visual Checklist

Executed as part of RESP-01 and STYLE-01/02, and again by hand during Issue #17. The checklist
itself is defined once, in `ui-spec.md` §16, so it is not duplicated here.

## 5. Test Commands

- Server: `npm test` inside `server/`
- Client: `npm test` inside `client/`
- E2E: `npx playwright test` from the repo root (added in Issue #17; not yet in `package.json`)

## 6. Final Results

Every row above starts **Planned**. A row moves to **Pass** once its test exists and passes on
its feature branch, and is re-verified on `main` before submission — this table is updated as
each Issue merges, not written once at the end.

## 7. Known Limitations or Deferred Tests

- No tests are planned for IT Staff workflow, ticket-status transitions beyond New, or
  authentication — all explicitly out of scope per `specification.md` §3.
- Ticket Number generation under simultaneous concurrent requests is not explicitly tested in
  Lab 2. This is a known limitation, not a hidden requirement — flagged here rather than left
  undocumented.
