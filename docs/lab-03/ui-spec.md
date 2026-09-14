# Lab 3 UI Specification — Zen Green Theme

## 1. Color tokens (reused from Lab 2)

| Token | Value | Use |
|---|---|---|
| Primary green | `#006B3C` | App header, primary buttons, strong emphasis |
| Secondary green | `#0B7A46` | Active tabs, focus accents, links, hover states |
| Pale green | `#EAF6EF` | Selected/success backgrounds, subtle section emphasis |
| Page background | `#F5F7F6` | App background behind all surfaces |
| Surface | `#FFFFFF`, border `#DCE3DF`, shadow `0 1px 3px rgba(0,0,0,0.08)` | Cards, panels, forms |
| Text | `#1B2B22` | Body and heading text |
| Editable field | bg `#FFFFFF`, border `#C9D2CC` | Any input the user can change |
| Read-only field | bg `#EDF2EF` | System-generated or non-editable values |
| Error | text/border `#B3261E`, bg tint `#FDEAEA` | Validation and failure messaging |
| Warning | bg `#FFF4DE`, text `#92600D` | Non-blocking caution (badges only) |
| Success | text/border `#0B7A46`, bg `#EAF6EF` | Confirmation, paired with an icon |

No new tokens are introduced in Lab 3 (labsheet §7) — every new screen draws from this same set.

## 2. Typography, spacing, control states, validation placement, button hierarchy

Unchanged from `docs/lab-02/ui-spec.md` §2–§5. Same font stack, spacing scale, field states
(editable/read-only/invalid/disabled/focused), asterisk-plus-inline-message validation, and the
five button kinds (primary/secondary/tertiary/destructive/busy). Two additions for Lab 3:

| Kind | Style | Example |
|---|---|---|
| Link-style action | Text-only, `#0B7A46`, underline on hover | "Reassign", "Claim" |
| Confirm dialog | Modal, primary = the destructive/irreversible choice, secondary = Cancel | Cancel Ticket, Reopen Ticket (BR-18) |

## 3. Application shell and role-based navigation

- Left: "TokTickIT" wordmark, primary green.
- Center: nav links **scoped to role** — a Requester never sees a "Queue" or "Admin" link in the
  markup at all (not just hidden by CSS), matching FR-06's server-enforced-first, hidden-button-
  isn't-security stance carried into the UI: the frontend simply never requests or renders a
  destination the current role can't reach.
  - Requester: My Tickets, Create Ticket
  - IT Staff: My Queue, Create Ticket is **not** shown (IT Staff don't file tickets in Lab 3)
  - Administrator: Users
- Right: current user's **name and role badge**, replacing Lab 2's Development Requester display,
  with a Profile menu containing Change Password and Logout.
- Mobile: nav collapses behind a menu control; name/role and Logout remain reachable without
  opening it.

## 4. Login and Mandatory Password Change

**Login** — email field, password field (masked, with a show/hide toggle), Sign In primary button.
On failure: one red inline banner above the button, "Invalid email or password," for wrong
credentials *and* inactive accounts alike (BR-06/BR-07) — the UI has no separate visual state for
"this account is inactive," because that distinction must not be visible to the user. Busy state:
button shows a spinner and "Signing in…", both fields disabled.

**Change Password** — shown immediately after a successful login when `mustChangePassword` is
true, replacing the rest of the app (no nav, no way to skip it). Current (temporary) password,
new password, confirm new password. A live checklist under the new-password field mirrors BR-10:
"At least 8 characters," "Contains a letter," "Contains a number" — each turns green with a check
as satisfied, matching the Zen Green success token, never color alone (the check icon carries the
meaning). Continue is disabled until all three are satisfied and confirm matches. Same screen
layout serves a voluntary password change from the Profile menu later — the only difference is a
Cancel option is available (there's nothing to force in that case).

## 5. Requester screens — regression + additions

Every Lab 2 Requester screen (Create Ticket, My Tickets, Ticket Detail, Attachments) keeps its
Lab 2 layout unchanged — see `docs/lab-02/ui-spec.md` §10–§15. Two changes only:

- The Development Requester selector and "Change Requester" action are removed everywhere;
  the shell's identity display (§3 above) replaces it.
- Requester Ticket Detail gains a **Public Comments** panel below the Attachments section (own
  heading, own divider, same pattern Lab 2 used to separate Attachments from Ticket fields) and a
  **"Problem Appears Resolved"** secondary button. Clicking it shows a confirmation ("Let IT Staff
  know this looks fixed?"), then a small success toast — it never changes the Current Status badge
  on this screen (BR-05); if IT Staff has already confirmed-resolved, the badge simply shows
  "Requester confirmed" as a secondary tag next to the button instead of a button.

## 6. IT Staff Ticket Queue

**Desktop table**, 7 columns (specification.md §11's justified cut): Ticket #, Summary (truncated
one line), Requester, Status (badge), IT Priority (badge), Assigned To (name, or "Unassigned" in
muted text), Created (relative + absolute on hover). Clicking a row opens Ticket Detail.

**Mobile card:** Ticket # and Status badge on the first line, Summary below, Requester and IT
Priority badge as a secondary line, Assigned To and Created as a third muted line. The whole card
opens Ticket Detail.

Above the list: a search box, filter controls for Status / IT Priority / Assigned (Me / Unassigned
/ Anyone), and a sort control offering the three `api-spec.md` §4 sort values (Created, IT
Priority, Status), each ascending/descending, defaulting to Created ascending. A **Clear filters**
tertiary button appears only once a filter is active. Pagination: Previous / page numbers / Next,
fixed page size (20), centered below the list — same pattern as Lab 2's My Tickets, no page-size
picker (api-spec.md §9).

## 7. IT Staff Ticket Detail

Extends the Lab 2 Ticket Detail layout (`docs/lab-02/ui-spec.md` §14) rather than replacing it.
Top block gains two editable controls alongside the existing read-only Ticket fields: a **Ticket
Owner** dropdown (Claim button when unassigned; a dropdown to reassign once claimed, listing
active IT Staff) and an **IT Priority** dropdown (editable by any IT Staff regardless of
ownership — api-spec.md §4). **Current Status** becomes a dropdown offering only the transitions
`specification.md` §11's matrix permits from the ticket's current status; an owner-required
transition is disabled (not hidden — grayed out with a tooltip "Claim this ticket first") when the
viewer isn't the current owner, so the control's *existence* still communicates the workflow.
Cancelling or Reopening opens the confirm dialog from §2.

Below the Ticket fields, a tab strip: **Public Comments**, **Internal Notes**, **Attachments**
(Lab 2's, unchanged). Public Comments and Internal Notes use the same list-plus-composer layout,
but are **visually distinct by design, not label alone**: Public Comments use a white card with the
pale-green (`#EAF6EF`) left border used for informational content; Internal Notes use a light
amber (`#FFF4DE`) card background with a small lock icon and "Internal — not visible to Requester"
caption on every entry, so a staff member composing a note is reminded of its visibility at the
point of typing, not just at the point of reading (labsheet §8.4's "not accidentally posted
publicly" concern). Both composers show a live character counter approaching the 2,000-character
cap (BR-16) and disable Post while empty/whitespace-only.

## 8. Administrator User Management

One screen, list-plus-panel layout (no separate create/edit pages).

**List** (left/main): Name, Email, Role (badge), Status (badge), Edit action. Above it: a search
box (name/email) and an optional Role filter dropdown. No pagination control (labsheet §8.5 — the
seed data is small enough that this is genuinely fine to skip).

**Create/Edit panel** (slide-over or side panel, not a full page navigation): Name, Email, Role
(one of the three, radio group not multi-select — reinforces "one role" visually), Active toggle.
Create additionally shows, after a successful save, a one-time **"Initial password: `kQ7m2XpR9s`
— copy this now, it won't be shown again"** callout with a copy-to-clipboard button (api-spec.md
§6 — there is no email path, so this is the only place the Administrator ever sees it). Edit
replaces Create's fields with the same layout plus a **Set New Password** secondary action that
reveals the same one-time callout pattern. A **Deactivate**/**Activate** destructive-style button
sits at the panel's bottom; clicking Deactivate on the signed-in Administrator's own account, or on
the last remaining active Administrator, shows an inline error instead of submitting ("You can't
deactivate your own account." / "At least one Administrator must stay active.") — matching
api-spec.md §8's `409` responses rather than a generic failure banner, since these are two specific,
anticipated states, not an unexpected error.

## 9. Badges

| Badge | Background | Text | Non-color cue |
|---|---|---|---|
| Status — New | `#EAF6EF` | `#0B7A46` | word always shown |
| Status — Open | `#EAF6EF` | `#0B7A46` | word always shown |
| Status — In Progress | `#FFF4DE` | `#92600D` | word always shown |
| Status — Waiting for Requester | `#FFF4DE` | `#92600D` | word always shown |
| Status — Resolved | `#EAF6EF` | `#0B7A46` | word always shown, paired with a check icon |
| Status — Closed | `#EDF2EF` | `#1B2B22` | word always shown (neutral, not success/warning) |
| Status — Reopened | `#FDEAEA` | `#B3261E` | word always shown |
| Status — Cancelled | `#EDF2EF` | `#1B2B22` | word always shown, paired with a strike-through icon |
| Priority — LOW/MEDIUM/HIGH | same as Lab 2 §12 | same | reused unchanged for both Requested and IT Priority |
| Role — Requester | `#EDF2EF` | `#1B2B22` | word always shown |
| Role — IT Staff | `#EAF6EF` | `#0B7A46` | word always shown |
| Role — Administrator | `#FFF4DE` | `#92600D` | word always shown |

## 10. Screen modes and feedback (labsheet §8.6)

| Screen | Modes | Feedback covered |
|---|---|---|
| Login | view, busy | validation, busy, safe failure (generic invalid-credentials) |
| Change Password | view, busy | validation (live checklist), success (redirect into app) |
| Ticket Queue | view (list) | loading (skeleton rows), empty, no-results, safe failure, forbidden (redirect if role changes mid-session) |
| Staff Ticket Detail | view, edit (inline field-level) | validation, success (toast per field save), conflict (`409` invalid transition/already-assigned), not-found, forbidden, safe failure |
| Admin User Management | view (list), create, edit | validation (duplicate email, invalid role), success, conflict (self-deactivation, last-admin), forbidden, safe failure |
| Requester Ticket Detail (regression) | view, create (comment) | validation, success, not-found (BR-12), safe failure |

Every row above maps to at least one planned test in `tests.md` — labsheet §8.6's explicit
requirement that these behaviors be covered by tests, not just designed.

## 11. Responsive and accessibility

Same breakpoints and rules as Lab 2 (§7/§8/§9 there; labsheet §8.7 says "same as Lab 2"): desktop
≥992px, tablet 768–991px, mobile <768px, no horizontal scroll, no clipping/overlap at any width.
The Queue's 7-column table becomes the stacked card from §6 below 992px rather than a horizontally
scrolling table. The Admin panel becomes a full-width slide-up sheet on mobile instead of a
side-by-side panel. All interactive controls — role-based nav, status/priority/owner dropdowns,
comment/note composers — are keyboard-reachable, and every badge pairs color with its word or icon
(§9), never color alone.

## 12. Visual inspection checklist

- [ ] No clipped labels at any viewport, on any new Lab 3 screen
- [ ] No overlapping validation, status, or toast messages
- [ ] No unintended horizontal scrolling on Queue, Staff Ticket Detail, or User Management
- [ ] Role-based nav never renders a link the current role cannot use
- [ ] Every badge (status/priority/role) pairs color with text or icon
- [ ] Public Comments and Internal Notes are visually distinguishable at a glance, not just by caption
- [ ] Editable vs. read-only field styling is consistent with Lab 2's tokens across every new screen
- [ ] Every state in §10 is represented, not just the happy path
- [ ] Desktop table and mobile card behavior both checked for the Queue

## 13. Screenshot paths

Matches `artifacts/lab-03/screenshots/` in the required structure (labsheet §12):
`authentication/`, `staff-queue/`, `staff-ticket-detail/`, `user-management/`. Captured by
Playwright at `1920×1080`/`deviceScaleFactor: 2` for state evidence and `1280×900` / `768×1024` /
`375×812` (×2 scale) for the Part 9 responsive set — see `LAB3_PLAN.md` "Screenshot evidence" for
the full capture schedule and naming convention (`p<part>-<nn>-<state>.png`), not duplicated here.

## 14. CSS class naming

Extends `docs/lab-02/ui-spec.md` §18 rather than replacing it — all Lab 2 classes stay valid.

| Element | Class | Notes |
|---|---|---|
| Status badge | `.tt-badge-status-new` / `-open` / `-in-progress` / `-waiting` / `-resolved` / `-closed` / `-reopened` / `-cancelled` | colors per §9 |
| Role badge | `.tt-badge-role-requester` / `-it-staff` / `-administrator` | colors per §9 |
| Internal Note card | `.tt-note-internal` | amber background + lock icon, distinct from `.tt-comment-public` |
| Public Comment card | `.tt-comment-public` | pale-green left border |
| Owner-required control, viewer not owner | `.tt-disabled-not-owner` | grayed + tooltip, still rendered (not `display:none`) |
| One-time password callout | `.tt-initial-password-reveal` | copy-to-clipboard button inside |
| Confirm dialog | `.tt-confirm-dialog` | used for Cancel/Reopen (§2) and Deactivate |
