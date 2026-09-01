# Peer Review — Lab 2

**Author:** ShitheadQuin (Jeerasak Phisawong 67070503461)
**Partner:** Chanat-888 (Chanat Dachkumhang  67070503409)

Filled in as PRs are opened, reviewed, and approved throughout the sprint — not reconstructed at
the end.

## Reviews I gave on my partner's PRs

_(added as they happen)_

## Reviews my partner gave on my PRs

Pull Requests I authored (reviewed by my partner):

| PR | Branch | Base | Reviewer verdict |
|----|--------|------|-------------------|
| [#19](https://github.com/ShitheadQuin/Toktickit/pull/19) | feature/10-lab2-spec | lab2-staging | Requested changes (5 points), fix pushed, re-request sent — approved, merged into lab2-staging |
| [#20](https://github.com/ShitheadQuin/Toktickit/pull/20) | feature/11-data-seed | lab2-staging | Requested changes (2 points), fix pushed, approved, merged into lab2-staging |
| [#21](https://github.com/ShitheadQuin/Toktickit/pull/21) | feature/12-requester-context | lab2-staging | Requested changes (3 points), fixes pushed, approved, merged into lab2-staging |
| [#23](https://github.com/ShitheadQuin/Toktickit/pull/23) | feature/spec-attachment-rules | lab2-staging | Requested changes (2 points), fixes pushed, re-request sent |

### Issue 10 — [ShitheadQuin/Toktickit#19](https://github.com/ShitheadQuin/Toktickit/pull/19)

**Chanat's comments (blocking):**
1. `api-spec.md` justified `X-Requester-Id` for attachment download, but a browser can't set a
   custom header from a plain `<a href>`/`<img>` tag, so the download link in `ui-spec.md` §15
   was unreachable as specified. Asked for either a `requesterId` query param on download only,
   or fetching the file as a blob.
2. The Requester field was missing from Create Ticket, even though labsheet §4.4 lists it as
   required and Part 6 needs proof it's populated from the selected Requester and matches the
   saved `requesterId`.
3. `tests.md`'s STYLE-01 asserts "required CSS classes," but `ui-spec.md` named none, and
   labsheet §8.8 compares style checks against `ui-spec.md`.

**Chanat's comments (should-fix):**
4. `specification.md` §10 Definition of Done omitted peer review and visual inspection, both
   required by labsheet §4.1.
5. Seed data was left unspecified, though labsheet §5.3 requires 4 categories, 6+ related
   systems, 4 active + 1 inactive Requester, idempotent.

**Chanat's comments (minor):** no FR covered `GET /api/categories`/`GET /api/related-systems`;
`specification.md` §11 claimed the Ticket Number format hides the database id, but the
`api-spec.md` example paired id `42` with `TKT-2026-000042`.

**My response:** Went with the query-param fix for item 1 (`requesterId` on download only,
keeping every other endpoint on the header) since it keeps the download link a plain, right-click-able `<a href>` rather than needing a blob-fetch workaround. Added the Requester
field to the Create Ticket layout (`ui-spec.md` §8) plus AC-27, and extended `tests.md`'s
UI-08/traceability to cover it. Added a CSS class naming table (`ui-spec.md` §18) and pointed
STYLE-01 at it instead of the nonexistent §8.3. Added the two missing DoD bullets, a new
`specification.md` §12 Seed Data section with the exact counts, FR-17 for the reference-data
endpoints, and reworded the Ticket Number bullet to drop the false "hides the id" claim.
Posted the full breakdown as a PR comment, pushed the fix commit, and re-requested review —
awaiting Chanat's re-check.

### Issue 11 — [ShitheadQuin/Toktickit#20](https://github.com/ShitheadQuin/Toktickit/pull/20)

**Chanat's comments (blocking):**
1. The migration had no database sequence for ticket number generation, though
   `specification.md` §11 calls for one. Asked to either add `CREATE SEQUENCE` or clarify that
   Issue #12 would handle it.
2. Two separate single-column indexes on `requesterId` and `ticketDate` should be a composite
   index matching the actual query pattern instead: `@@index([requesterId, ticketDate])`.

**Chanat's comments (minor):**
3. `RelatedSystem` had `createdAt` but no `updatedAt`, while `Requester` and `Ticket` had
   both — asked for `updatedAt` on `RelatedSystem` too, for consistency.

**My response:** Added `CREATE SEQUENCE ticket_number_seq` via a raw-SQL migration step
(Prisma doesn't support sequences natively), replaced the two single-column indexes with the
composite `@@index([requesterId, ticketDate])` matching the hot query path, and added
`updatedAt` (with `@default(now())`) to `RelatedSystem`. Chanat approved after the fixes;
PR #20 merged into `lab2-staging`.

### Issue 12 — [ShitheadQuin/Toktickit#21](https://github.com/ShitheadQuin/Toktickit/pull/21)

**Chanat's comments (blocking):**
1. No Zen Green styling anywhere — `client/src/index.css` had none of the §7 tokens
   (`#006B3C`, `#0B7A46`, `#EAF6EF`, `#F5F7F6`), and the Continue button used plain Bootstrap
   styling instead of the `.tt-*`/`.btn-tt-*` classes named in `ui-spec.md` §18.

**Chanat's comments (should-fix):**
2. `AppShell` had no My Tickets or Create Ticket links, no active-page indication, and no
   mobile nav, which `ui-spec.md` §10 and labsheet §8 require.

**Chanat's comments (minor):**
3. The inline "Requester selected" check repeated in each page should become a shared route
   guard once more routes need it (e.g. `/tickets`), rather than staying inline.

**My response:** Checked each point against Issue #12's actual acceptance criteria before
acting (nothing gets fixed without confirming it's actually in scope). Item 1 was genuinely
required — added `client/src/theme.css` with the `--tt-*` tokens from `ui-spec.md` §1/§3/§5
and the `.btn-tt-primary`/`.btn-tt-secondary`/`.tt-alert-error`/`.tt-field` classes from §18,
layered on top of the existing Bootstrap classes per §18 ("built on top of the existing
Bootstrap-based stack rather than replacing it" — not a rewrite, as the comment's wording could
have implied), and wired them into `RequesterSelector.tsx` and `AppShell.tsx`. Item 2 was
correctly out of scope for Issue #12 — neither #12 nor (at the time) #13/#14 listed nav links
in their acceptance criteria — so rather than just promising it verbally in a PR comment, added
an explicit new acceptance criterion to Issue #14 ("AppShell shows My Tickets and Create Ticket
nav links with active-page indication and a collapsing mobile nav, per `ui-spec.md` §10") so the
work has a clear formal owner. Item 3 (minor) acknowledged as worth doing once `/tickets` routes
exist; deferred to whichever Issue introduces them, no code change needed yet. Retook all six
Issue #12 screenshots after the styling fix so evidence matches the final UI, not the pre-fix
version. Chanat approved after the fixes; PR #21 merged into `lab2-staging`.

### Issue 24 — [ShitheadQuin/Toktickit#23](https://github.com/ShitheadQuin/Toktickit/pull/23)

Documentation-only PR adding the attachment business rules labsheet §4.5 requires (BR-26, BR-27),
the optional BR-28, acceptance criteria AC-28/AC-29, and the My Tickets Last Updated column.

**Chanat's comments (requested changes):**
1. `DELETE /api/attachments/:id` does not mention the `updatedAt` bump. BR-28 covers both upload
   and soft removal, and `POST /api/tickets/:id/attachments` states it, but the DELETE section
   does not. API-21 tests both actions, so the contract should say both.
2. The Last Updated column was added to the desktop table but not to the mobile card, and not to
   the sort control. `api-spec.md` §4 now accepts `sort=updatedAt`; if the UI cannot reach it, the
   sort value has no user path. Asked whether the sort control exposes it.

**Chanat's verification (no change requested):** confirmed BR-26 writes the file before the
database row and deletes it on a failed write, and correctly limits compensation to the upload
rather than the Ticket per BR-19; confirmed BR-27's order settles existence and ownership before
the file checks so a rejection cannot leak another Requester's Ticket, and that `api-spec.md` §5
repeats the same five steps; confirmed AC-28 and AC-29 both map to tests and BR-28 has API-21.

**My response:** Both points accepted — neither needed arguing, and both were real gaps rather
than preference.

Point 1 was a plain omission: the `updatedAt` sentence was written into the upload endpoint and
not the removal one, even though BR-28 and API-21 both cover removal. Added to the DELETE section
in `api-spec.md`.

Point 2 was the more useful catch. `sort=updatedAt` had been added to the API contract without
anything in `ui-spec.md` saying the user could select it — a permitted API value with no user
path, exactly as described. Fixed by naming the sort control's options explicitly in §11 (Ticket
Date, Last Updated, Ticket Number, Requested Priority, Current Status, ascending or descending,
default Ticket Date descending per BR-10) and stating that every permitted API sort value is
reachable from the UI. This follows the pattern §11 already used for page size, which is
explicitly documented as *not* exposed — so the spec now says plainly, in both directions, what
the UI does and does not offer.

The mobile card was a real consequence of point 2 rather than a separate nit: once Last Updated
is sortable, a phone user sorting by it would see an order the card does not explain. Added it as
its own muted line beneath the secondary line rather than as a fourth item on that line, because
four items wrap at narrow widths and AC-25 fails on clipped or overlapping content — the reason
is written into §11 so the choice is documented rather than arbitrary.

No code changed in this PR; Issue #14 implements the column and the sort control, Issue #16
implements BR-26/27/28.
