# Lab 2 UI Specification — Zen Green Theme

## 1. Color tokens

| Token | Value | Use |
|---|---|---|
| Primary green | `#006B3C` | App header, primary buttons, strong emphasis |
| Secondary green | `#0B7A46` | Active tabs, focus accents, links, hover states |
| Pale green | `#EAF6EF` | Selected/success backgrounds, subtle section emphasis |
| Page background | `#F5F7F6` | App background behind all surfaces |
| Surface | `#FFFFFF`, border `#DCE3DF`, shadow `0 1px 3px rgba(0,0,0,0.08)` | Cards, panels, the form itself |
| Text | `#1B2B22` | Body and heading text — dark charcoal-green, not pure black |
| Editable field | bg `#FFFFFF`, border `#C9D2CC` | Any input the Requester can change |
| Read-only field | bg `#EDF2EF` (soft gray-green) | System-generated or non-editable values |
| Error | text/border `#B3261E`, bg tint `#FDEAEA` | Validation and failure messaging |
| Warning | bg `#FFF4DE`, text `#92600D` | Non-blocking caution callouts and badges only — never decorative |
| Success | text/border `#0B7A46`, bg `#EAF6EF` | Confirmation states, paired with a checkmark icon, not color alone |

Read-only was set to a soft gray-green (`#EDF2EF`) rather than warm ivory — it stays inside the
green family the rest of the palette already uses, instead of introducing a second hue.

## 2. Typography and spacing

- Font: system UI stack (`-apple-system, Segoe UI, Roboto, sans-serif`), matching the existing
  Bootstrap-based app from Lab 1 — no new font is introduced.
- Base body size 16px; field labels 14px/600 weight; validation and helper text 13px.
- Spacing scale: 4 / 8 / 12 / 16 / 24 / 32px. Form fields use 16px vertical gaps; sections use 32px.

## 3. Control states

| State | Appearance |
|---|---|
| Editable | White background, `#C9D2CC` border, 40px height |
| Read-only | `#EDF2EF` background, no border emphasis, not focusable |
| Invalid | `#B3261E` border, message directly below the field |
| Disabled | 50% opacity, no hover/focus effect, pointer events off |
| Focused | 2px `#0B7A46` outline, visible for keyboard navigation and never removed |

Multiline Description is taller (120px) and resizable vertically only, so it cannot break the
layout by growing sideways.

## 4. Required fields and validation placement

A required field's label carries a red asterisk (`#B3261E`) immediately after the label text.
The asterisk is a visual cue only — it never substitutes for the actual validation message, which
appears directly beneath the field the moment validation fails (on blur, and again on submit
attempt), never only as a single banner at the top of the form.

## 5. Button hierarchy

| Kind | Style | Example |
|---|---|---|
| Primary | Solid `#006B3C`, white text | Submit, Create Ticket |
| Secondary | White bg, `#0B7A46` border and text | Cancel, Back to My Tickets |
| Tertiary | Text-only, `#0B7A46`, no border | Clear filters |
| Destructive | White bg, `#B3261E` border and text | Remove Attachment |
| Disabled | Gray bg/text, no hover response | Any button while its precondition isn't met |
| Busy | Primary style + spinner, disabled, label changes (e.g. "Submitting…") | Submit while in flight |

Every button shows visible text; an icon may sit alongside it but never replaces it. An
icon-only control (e.g. a table row's overflow menu) additionally carries `aria-label` and a
tooltip.

## 6. Attachment selection and error presentation

Selecting a file adds a row to a list beneath the picker: filename, size, and a type icon. A
rejected file (wrong type or over 5MB) shows its row with a red inline message explaining why,
next to that specific file — not as one generic alert for the whole form.

## 7. Screen states

| Screen | Initial | Loading | Validation | Submitting | Success | Failure |
|---|---|---|---|---|---|---|
| Requester Selection | Empty dropdown | Spinner, Continue disabled | — | — | Redirects to shell | Safe error message, retry |
| Create Ticket | Empty form, reference data loading | Dropdowns show a loading placeholder | Field-level red messages | Busy Submit, form locked | Ticket Number shown, next action offered | Safe error, all field values retained |
| My Tickets | — | Skeleton rows | — | — | List renders | Safe error with retry |
| Ticket Detail | — | Skeleton fields | — | — | Read-only fields render | Safe error / not-found / forbidden message |

## 8. Responsive layout rules

| Viewport | Behavior |
|---|---|
| Desktop ≥ 992px | Multi-column layout, content centered with a max width of 1140px |
| Tablet 768-991px | Two-column layout; Summary and Description keep full width within it |
| Mobile < 768px | Everything stacks in one column; buttons stay full-width and touch-sized (min 44px tall); no horizontal scrolling |
| All sizes | No clipped labels, no overlapping messages, no hidden buttons, attachment names remain fully readable (wrap, don't truncate silently) |

Create Ticket: desktop/tablet place system-generated fields (Ticket Number, Ticket Date) at the
top in a two-column row, classification fields (Category, Related System, Requested Priority)
grouped in the row below, Summary and Description each full-width beneath that, Attachments
below the fields, actions at the bottom. Mobile stacks every field in that same order.

## 9. Accessibility

- Every input's label is programmatically associated (`<label for>`/`id`).
- Focus outlines are never suppressed.
- Icon-only controls carry both an `aria-label` and a visible tooltip.
- Badges and states never rely on color alone — Requested Priority badges pair color with the
  priority word itself; validation and success states pair color with an icon and with text.
- All interactive controls, including the Requester dropdown and filter controls, are reachable
  and operable by keyboard alone.

## 10. Application shell and navigation

- Left: "TokTickIT" wordmark, primary green.
- Center/left of that: My Tickets and Create Ticket links; the active page is shown with a pale
  green background and secondary-green text, not color alone — an underline accompanies it.
- Right: current Requester's name, with a Change Requester action beside it.
- Mobile: the nav collapses behind a menu control; the current Requester and Change Requester
  action remain visible without opening the menu.

## 11. My Tickets — list, search, filter, sort, pagination

**Desktop table columns:** Ticket Number, Summary (truncated with ellipsis past one line),
Category, Requested Priority (badge), Current Status (badge), Ticket Date, an action to open the
Ticket. **Mobile card:** Ticket Number and Current Status badge on the first line, Summary below
it, Category/Requested Priority/Ticket Date as a secondary line; the whole card opens the Ticket.

Above the list: a search box, filter controls for Category / Related System / Current Status /
Requested Priority, and a sort control. A **Clear filters** tertiary button appears only once a
search term or filter is active. Pagination controls sit below the list, centered: Previous /
page numbers / Next. Page size is not exposed as a user control in Lab 2 — the frontend always
requests the default page size from `api-spec.md`; the query contract's other permitted sizes
exist for the API itself and its tests, not a UI selector the labsheet never asked for.

## 12. Priority and status badges

| Badge | Background | Text | Non-color cue |
|---|---|---|---|
| Requested Priority — LOW | `#EAF6EF` | `#0B7A46` | word "Low" always shown |
| Requested Priority — MEDIUM | `#FFF4DE` | `#92600D` | word "Medium" always shown |
| Requested Priority — HIGH | `#FDEAEA` | `#B3261E` | word "High" always shown |
| Current Status — New | `#EAF6EF` | `#0B7A46` | word "New" always shown |

Lab 2's only reachable Current Status is New (BR-02; status changes are out of scope per §4.2),
but the badge component itself is built generically so later labs can add statuses without
rebuilding it.

## 13. Empty vs. no-results

**Empty** (a Requester with zero Tickets ever): a friendly illustration/icon, "You haven't
created any tickets yet," and a prominent Create Ticket button.

**No-results** (a search or filter that matches nothing, on a Requester who does have Tickets):
a lighter message, "No tickets match your search or filters," and a Clear filters action — no
large call-to-action graphic, since the Requester already has tickets and the fix here is to
change the search, not to create a new one.

## 14. Requester Ticket Detail — read-only layout

Top: Ticket Number, Ticket Date, Current Status badge. Below: classification block (Category,
Related System, Requested Priority). Below that: Summary and Description, full width. The
Attachment section sits below all Ticket fields behind its own heading and a visible divider, so
Ticket information and attachment actions are never visually merged.

## 15. Attachment states

| State | Appearance |
|---|---|
| Active | Thumbnail/type icon, filename, size, Download link, Remove button |
| Uploading | Filename with a progress indicator, no Remove button yet |
| Invalid | Red inline row explaining the rejection (§6), dismissible, never uploaded |
| Removed | Grayed out, filename plus "Removed — `<reason>`", no Download link, no preview |
| Unavailable | Shown when a download/preview attempt fails (e.g. network error): icon + safe message, no broken image/link |

## 16. Visual inspection checklist

- [ ] No clipped labels at any viewport
- [ ] No overlapping validation or status messages
- [ ] No unintended horizontal scrolling on any screen
- [ ] Field styling (editable/read-only/invalid/disabled) is visually consistent across screens
- [ ] Every state in §7 is represented, not just the happy path
- [ ] Attachment filenames remain fully readable at mobile width
- [ ] Badge colors match §12 and never rely on color alone
- [ ] Desktop table and mobile card behavior both checked for My Tickets

## 17. Screenshot paths

Captured per `artifacts/lab-02/screenshots/<screen>/`, named `p<part>-<nn>-<state>.png`:

- `create-ticket/` — initial, validation failure, busy, success, API failure, invalid attachment
- `my-tickets/` — Requester A, Requester B, search, filter, sort, page 2, empty, no-results
- `ticket-detail/` — owned detail, add attachment, download, soft removal, removed metadata,
  blocked download, unauthorized access

Full capture schedule, including which screenshots pair with which Issue, is tracked in
`LAB2_PLAN.md`, not duplicated here.
