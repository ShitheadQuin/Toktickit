# Lab 4 UI Specification: Zen Green Theme

Lab 4 adds screens and sections; it changes no token. Everything in `docs/lab-02/ui-spec.md` and
`docs/lab-03/ui-spec.md` (tokens, typography, field states, validation placement, button kinds,
badges, confirm dialog, breakpoints, CSS class names) still applies. Rule numbers refer to
`docs/lab-04/specification.md`.

## 1. Tokens

No new colour tokens (labsheet §7). The dashboard, Actions Taken and history all use the Lab 2
set: primary `#006B3C`, secondary `#0B7A46`, pale `#EAF6EF`, page `#F5F7F6`, surface white with
border `#DCE3DF`, text `#1B2B22`, read only `#EDF2EF`, error `#B3261E` on `#FDEAEA`, warning
`#92600D` on `#FFF4DE`.

## 2. Application shell and navigation

| Role | Navigation, in order |
|---|---|
| Requester | Dashboard, My Tickets, Create Ticket |
| IT Staff | Dashboard, Ticket Queue |
| Administrator | Dashboard, Ticket Queue, Users |

- The Lab 3 IT Staff link text "My Queue" becomes "Ticket Queue", since the queue shows every
  Ticket, not only the user's own.
- The active page keeps the Lab 3 underline and `aria-current="page"`.
- After sign in, and at `/`, every role lands on `/dashboard`.
- Links a role cannot use are not rendered at all (Lab 3 rule, unchanged).

## 3. Dashboards (shared layout)

Title "Welcome, {first name}" with a one line subtitle and a **Refresh** secondary button. Below
it, in this order:

1. **Metric cards**, one row. Each card: label (text, not colour, carries the meaning), large
   number, and a "View" link to its drill down. The whole card is one link with an accessible
   name such as "My Open Tickets: 3, view list". A card with no drill down ("My Open Actions") is
   not a link and has no "View".
2. **Two column area** from 992 px: the left column holds the lists, the right column holds the
   breakdowns or quick actions. Below 992 px the columns stack.
3. **Lists** show at most 5 rows: Ticket number (link), summary on one line with ellipsis, status
   badge, and date in Asia/Bangkok time. A "View all" link sits in the list header.

**States**

| State | What the user sees |
|---|---|
| Loading | Card numbers and list rows show the Lab 3 skeleton (`tt-skeleton-row`); Refresh is busy |
| Empty | Cards show `0`; each empty list shows a sentence, for example "No Tickets need your reply." |
| Forbidden | Not reachable from the navigation; a direct `403` shows "You do not have access to this page." with a link back to the dashboard |
| Safe failure | Error banner "The dashboard could not be loaded. Try again." with a Retry button; nothing stale is shown as current |

## 4. Requester Dashboard

- Cards: My Open Tickets, Waiting for Me, Resolved, Closed (BR-26).
- "Waiting for Me" uses the warning token border when its count is above 0, plus the text "Needs
  your reply", so attention is never signalled by colour alone.
- Left: My Recent Tickets. Right: Recently Resolved, then two quick actions, Create Ticket and
  View My Tickets.
- It never repeats the My Tickets table: no search, filters or pagination here.

## 5. Staff Dashboard (IT Staff and Administrator)

- Cards: Unassigned, My Tickets, High IT Priority, My Open Actions.
- Left: Recent Tickets, then My Open Actions (description, Ticket number link, action status
  badge, Action Date/Time).
- Right: **By Status** list (all 8 statuses with badge and count, each a link) and **By IT
  Priority** (3 rows, each a link), then Administrator only **User Accounts** (active Requesters,
  IT Staff, Administrators, inactive total, "Manage users" link).
- Quick action: Open Ticket Queue.

## 6. URL filters on My Tickets and Ticket Queue

Both pages read their filters from the URL on load and write them back when the user changes a
control, so a dashboard link, the browser Back button and a copied link all show the same list.
A `statusGroup=active` filter shows as a removable chip "Active statuses", because neither page
has a control for it. **Clear filters** removes it too.

## 7. Actions Taken on Staff Ticket Detail

A new section titled "Actions Taken" sits below the Ticket fields and above the Comments / Notes /
Attachments tabs, since it is the main work record. Its heading shows the count and the gate
summary, for example "Actions Taken (3) · 1 completed, 1 open".

**List mode.** From 992 px, a table: Date/Time, Description, Assignee, Status (badge), Follow Up
(a flag icon with the words "Follow up"), Performed By. Below 992 px each Action is a card with
the same fields, stacked. Rows are ordered by Action Date/Time, oldest first. Selecting a row opens
it in view mode. Empty: "No actions recorded yet." with the Add Action button.

**Create mode.** "Add Action" (primary) opens an inline form panel above the list:

| Field | Control | Rule shown |
|---|---|---|
| Action Date/Time | `datetime-local`, default now | BR-06 |
| Action Description * | textarea, counter to 2,000 | BR-07 |
| Status | select: Planned, In Progress, Completed | BR-09 |
| Result | textarea, counter to 2,000; required marker appears when Status is Completed | BR-07 |
| Assignee | select of active IT Staff and Administrators, default me | BR-05 |
| Follow Up Required | checkbox | |
| Follow Up Note | textarea, shown and required only when the checkbox is ticked | BR-08 |
| Attachment Notes | single line text, counter to 500, hint "Which file to look at, for example photo-1.jpg" | BR-07 |
| Performed By | read only field showing my name | BR-04 |

Buttons: Save Action (primary, busy and disabled while saving), Cancel (tertiary). One
`clientRequestId` is generated when the form opens and reused for every retry of that form.

**View / edit mode.** The selected Action opens in the same panel. Planned and In Progress Actions
show editable fields and Save Changes. Completed and Cancelled Actions show every field in the
read only style with the note "Completed Actions cannot be changed" (or "Cancelled ...") and no
Save button. Changing Status to Cancelled asks for confirmation using the Lab 3 confirm dialog.

**Feedback**

| Case | Behavior |
|---|---|
| Validation | Red message under each failing field, focus moves to the first one |
| Success | Panel closes, list refreshes, toast "Action saved" with a check icon |
| Inactive or invalid assignee | Message under Assignee, input kept |
| Stale (`409 STALE_UPDATE`) | Warning banner in the panel: "This Action changed while you were editing it." with a **Reload** button; typed values stay until Reload is chosen |
| Locked or Ticket closed | Message in the panel, panel becomes read only |
| Safe failure | Error banner "Your action could not be saved. Your entries are kept, try again." |

## 8. Status control and resolution feedback

- The status select lists only the transitions the matrix allows from the current status, as in
  Lab 3; ownership required moves stay visible but disabled with "Claim this ticket first".
- **Resolved** is disabled when the gate is not met, and its description reads either "Add and
  complete at least one Action first" or "Complete or cancel the open Actions first (2 open)".
- A server `409 RESOLUTION_GATE_NOT_MET` or `STALE_UPDATE` shows as a warning banner next to the
  control with a Reload button, and the displayed status is not changed.
- After any successful change the header status badge, the owner, the history and the gate
  summary refresh from the response.

## 9. Status History

A compact list titled "Status History" on Staff and Requester Ticket Detail: "Open → In Progress,
by Pimchanok Rattana, 8 Oct 2026 10:02". Oldest first. Empty: "No status changes recorded since
Lab 4." Read only, no controls.

## 10. Requester Ticket Detail additions

Read only "Actions Taken" section below the Ticket fields, same table / card layout as §7 without
any form or buttons, showing every Action including Cancelled ones (labsheet §8.3), followed by
Status History. Internal Notes remain absent.

## 11. Badges added

| Badge | Background | Text | Non-colour cue | Class |
|---|---|---|---|---|
| Action Planned | `#EDF2EF` | `#1B2B22` | word | `.tt-badge-action-planned` |
| Action In Progress | `#FFF4DE` | `#92600D` | word | `.tt-badge-action-in-progress` |
| Action Completed | `#EAF6EF` | `#0B7A46` | word + check icon | `.tt-badge-action-completed` |
| Action Cancelled | `#EDF2EF` | `#1B2B22` | word + strike icon | `.tt-badge-action-cancelled` |
| Follow up flag | `#FFF4DE` | `#92600D` | flag icon + "Follow up" | `.tt-flag-follow-up` |

## 12. Screen modes and feedback (labsheet §8.5)

| Screen | Modes | Feedback |
|---|---|---|
| Requester Dashboard | view | loading, empty, forbidden, safe failure |
| Staff Dashboard | view | loading, empty, forbidden, safe failure |
| Actions Taken (staff) | list, create, view/edit | validation, success, conflict, locked, safe failure with input kept |
| Actions Taken (Requester) | list | empty, not found |
| Status control | edit | gate blocked, conflict, invalid transition, success |
| My Tickets, Ticket Queue | view with URL filters | unchanged Lab 2 / 3 states plus the "Active statuses" chip |

Every row maps to a test in `tests.md`.

## 13. Responsive and accessibility

Same as Labs 2 and 3: desktop ≥ 992 px, tablet 768 to 991 px, mobile < 768 px; no horizontal page
scroll, clipping or overlap. Metric cards wrap to two per row on tablet and one per row on mobile.
The Actions table becomes cards below 992 px instead of scrolling sideways. Every control is
reachable by keyboard with the visible Lab 3 focus ring; the Action panel moves focus to its first
field when it opens and back to the Add Action button when it closes; the confirm dialog traps
focus and closes with Escape. Counts, statuses and flags always carry words, never colour alone.

## 14. Final polish (labsheet §7, §8.5)

- Sweep every screen from Labs 1 to 3 for temporary, duplicate or inconsistent elements and remove
  them. The `/diagnostics` page from Lab 1 stays, as it is outside the signed in shell and linked
  from nowhere in it.
- Every submit button disables while pending; every form keeps its input after a recoverable error.
- No console errors or warnings on any screen during the E2E run.
- An address that matches no screen shows "Page not found" inside the shell with a Back to Dashboard
  link, in the same alert style as "This Ticket does not exist.", instead of a blank page.
- No single line field or select cuts its text off: the read only Summary on both Ticket Detail
  screens wraps, and the Assign to select keeps room for its text, with Reassign moving below it
  when the column is narrower.

## 15. Visual inspection checklist

Completed in Issue #64. Each line names what verified it.

- [x] Dashboards: cards, lists and breakdowns consistent with Zen Green, no clipping at 3 widths.
  STYLE-02 and RESP-01; by eye on p9-01, 03, 05, 07, 09, 11.
- [x] Actions Taken: table and card forms, create and edit modes, read only look for locked Actions.
  RESP-01 (table from 992 px, cards below), STYLE-02 (locked Action read only); by eye on p9-02,
  06, 10 and p6-04, p6-07, p6-14.
- [x] Editable versus read only fields consistent with Lab 2 tokens on every Lab 4 screen. STYLE-02
  checks `--tt-readonly-bg` on every field of a locked Action, focused as well; #64 fixed a focused
  read only field turning white (Bootstrap's focus rule).
- [x] Validation messages placed under their fields, never overlapping. UI-03; by eye on p6-02.
- [x] Keyboard focus visible and in a logical order on dashboards and the Action panel. A11Y-01 and
  UI-11; #64 fixed focus not returning to Add Action after a save, and made every confirm dialog
  keep focus inside and close with Escape.
- [x] No horizontal overflow on any Lab 4 screen at 1280, 768, 375 px. RESP-01, and the capture
  script refuses to save a shot with overflow (p9-01 to p9-12); #64 fixed two clipped fields
  (Assign to, read only Summary).
- [x] Every status, action status and flag badge pairs colour with text or icon. STYLE-01, STYLE-02;
  by eye on p9-02 (✓ Completed, ⊘ Cancelled, ⚑ Follow up) and p9-03 ("Needs your reply").
- [x] No leftover placeholder, duplicate or obsolete control from Labs 1 to 3. HARD-01 sweeps every
  screen of every role for placeholder text, dead links and console problems; #64 added the
  missing not-found page.

## 16. Screenshot paths

`artifacts/lab-04/screenshots/staff-dashboard/`, `requester-dashboard/`, `actions-taken/`
(labsheet §12), plus `ticket-workflow/` (Part 7), `regression/` (Part 8's regression evidence)
and `responsive/` (Part 9: every major Lab 4 screen at 1280, 768 and 375 px). Captured by
Playwright from the seeded data with `deviceScaleFactor: 2`. Only the shots the labsheet asks for
are taken.
