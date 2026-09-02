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
| [#22](https://github.com/ShitheadQuin/Toktickit/pull/22) | feature/13-create-ticket | lab2-staging | Requested changes (5 points), fixes pushed, approved, merged into lab2-staging |
| [#23](https://github.com/ShitheadQuin/Toktickit/pull/23) | feature/spec-attachment-rules | lab2-staging | Requested changes (2 points), fixes pushed, approved, merged into lab2-staging |
| [#25](https://github.com/ShitheadQuin/Toktickit/pull/25) | feature/14-my-tickets | lab2-staging | Requested changes (3 points), fix pushed, approved, merged into lab2-staging |
| [#26](https://github.com/ShitheadQuin/Toktickit/pull/26) | feature/15-ticket-detail | lab2-staging | Merged by mistake before review — reverted via #27, redone as #28 |
| [#27](https://github.com/ShitheadQuin/Toktickit/pull/27) | revert-26-feature/15-ticket-detail | lab2-staging | Revert of #26, merged to restore the pre-review state |
| [#28](https://github.com/ShitheadQuin/Toktickit/pull/28) | feature/15-ticket-detail | lab2-staging | Requested changes (3 points), fix pushed, approved, merged into lab2-staging |
| [#29](https://github.com/ShitheadQuin/Toktickit/pull/29) | feature/16-attachments | lab2-staging | Requested changes (1 point), fix pushed, approved, merged into lab2-staging |
| [#30](https://github.com/ShitheadQuin/Toktickit/pull/30) | feature/17-e2e-visual | lab2-staging | Requested changes (3 points), fix pushed, approved, merged into lab2-staging |

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

### Issue 13 — [ShitheadQuin/Toktickit#22](https://github.com/ShitheadQuin/Toktickit/pull/22)

First implementation PR of the sprint: `POST /api/tickets`, `GET /api/related-systems`, the
Create Ticket screen, and the shared route guard.

**Chanat's comments (blocking):**
1. The client ignored `error.fields`. `if (!response.ok) throw` collapsed every non-2xx response
   into the generic "Unable to reach the server" banner, so a `400` listing its failing fields —
   the exact shape `api-spec.md` §1 defines, and what AC-09 and AC-10 are graded on — surfaced to
   the user as a network error with no field-level messages at all.
2. `.btn-tt-tertiary` was applied to the attachment Remove button but defined nowhere in
   `theme.css`, so the control rendered unstyled. `ui-spec.md` §18 lists it as a required class.

**Chanat's comments (should-fix):**
3. Selected attachments were silently dropped on submit. Nothing on screen told the Requester
   that upload arrives in a later Issue, so the form appeared to lose their files.

**Chanat's comments (minor):**
4. Ticket Number and Ticket Date were absent from the form, though `ui-spec.md` §8 places them in
   the read-only top row and Part 6 wants visible proof the server assigns them.
5. No client-side 5-file limit, though BR-15 caps a Ticket at 5 active attachments.

**Chanat's verification (no change requested):** confirmed the Ticket Number sequence is read
inside the request path rather than cached, `formatTicketNumber`'s zero-padding, the 400/404 split
between a malformed and an unknown `requesterId`, the batched field errors, the type-then-size
check order, AC-12's value preservation on failure, and `RequireRequester` as the shared guard.

**My response:** Verified all five against the actual code before agreeing — each was real, and
none needed arguing.

Item 1 was the serious one and a genuine spec violation rather than a preference. Fixed by reading
`error.fields` from the response body and mapping each message onto its own field, with server
errors spread over any client-side ones so the server stays authoritative. The `json()` parse is
guarded with `.catch(() => null)`, because without it an HTML `500` body would throw inside the
parse, fall through to the outer `catch`, and report a network failure again — the same wrong
banner by a different route. A rejection with no matching field, such as `404 REQUESTER_NOT_FOUND`,
shows the server's own message instead of being silently swallowed.

Item 2: added `.btn-tt-tertiary` to `theme.css` as a text-only control in `--tt-secondary`, per
§18. Item 3: the deferral is now stated on screen, under the picker and again on the success
screen, rather than left as a silent drop. Item 4: added Ticket Number and Ticket Date as
read-only fields in the three-column top row §8 describes. Item 5: added the client-side 5-file
check, positioned *after* type and size so the picker rejects in BR-27's exact order and the
client can never disagree with the server about which rule a file broke.

One suggestion was deliberately not taken. The alternative offered for item 3 was to disable the
attachment picker entirely until Issue #16 implements upload. That is reasonable as code, but it
would have made Part 6's "one valid and one invalid attachment selected" screenshot impossible to
capture until #16 merged — a review point that improves the code while destroying already-required
graded evidence. The on-screen notice satisfies the same concern without that cost, and the
trade-off was explained in the PR comment rather than left as a silent refusal.

Three tests were added for the fixed paths — the `400`-with-fields mapping, the `404` with no
matching field, and the sixth-file rejection — bringing the branch to 24 passing tests. Six Part 6
screenshots were retaken afterwards, since the review changed what the form looks like and
evidence has to match the merged UI rather than the pre-fix version. Chanat approved after the
fixes; PR #22 merged into `lab2-staging`.

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

### Issue 14 — [ShitheadQuin/Toktickit#25](https://github.com/ShitheadQuin/Toktickit/pull/25)

`GET /api/tickets` with search/filter/sort/pagination, and the My Tickets screen.

**Chanat's comments (blocking):**
1. Every row's Open button linked to `/tickets/${item.id}`, but `App.tsx` had no such route — a
   dead end. Asked for a placeholder route, or to point the button at Issue #15 and say so.

**Chanat's comments (should-fix):**
2. `.tt-pagination` and `.tt-list-controls` were used but defined nowhere in `theme.css` —
   `STYLE-01` asserts the §18 classes, and every other class introduced was defined.

**Chanat's comments (minor):**
3. `pageSize` is hard-coded to 10 with a code comment explaining why, but `ui-spec.md` §11 didn't
   say so, so a reader comparing the two would think the control was simply missing.

**Chanat's verification (no change requested):** confirmed ownership is the first clause of the
`where`, so no path can leak another Requester's rows; `matchesNothing` returns `200` with an
empty array rather than dropping the filter or erroring; `ticketNumber desc` is the tie-breaker
and is skipped when it is itself the chosen sort (Prisma's duplicate-field trap); `requestSeq`
guards a slow response from overwriting a newer one; every filter/sort change resets to page 1;
empty and no-results states are properly distinguished with only one Clear filters button shown
at a time; the error state keeps the list rather than showing empty; both badges carry their
word; and the AppShell nav has the active state, underline, and collapsing mobile menu Issue #14
took on from the PR #21 review.

**My response:** Item 1 — added `TicketDetailPlaceholder.tsx` ("This screen is coming in Issue
#15" + a Back to My Tickets button), wrapped in `RequireRequester`/`AppShell` like the other
screens, and added the `/tickets/:id` route in `App.tsx`. Deliberately fetches nothing — real
data is Issue #15's job. Item 2 — added `.tt-list-controls` (white bordered panel, matching the
"white surfaces" rule) and `.tt-pagination` (`flex-wrap: wrap`, the same AC-25 no-overflow rule
already enforced elsewhere on this screen) to `theme.css`. Item 3 — already fixed on the branch
before the review round; no action needed. 33/33 client tests still passing. Chanat approved
after the fixes; PR #25 merged into `lab2-staging`.

### Issue 15 — [ShitheadQuin/Toktickit#28](https://github.com/ShitheadQuin/Toktickit/pull/28)

`GET /api/tickets/:id` and the read-only Requester Ticket Detail screen.

PR #26 (the first attempt at this branch) was **merged by mistake before any review** — my own
error, not Chanat's. Once caught, I reverted it (PR #27), which put `lab2-staging` back to its
pre-merge state, then reopened the same work as PR #28 and waited for a real review this time
before merging.

**Chanat's comments (blocking):**
1. Attachments came back with no defined order — the Prisma `select` had no `orderBy`, so row
   order was whatever Postgres returned. Stable in testing, would shuffle after an update. Asked
   for `orderBy: { uploadedAt: 'asc' }` so the Part 8 screenshots have a defined order.

**Chanat's comments (should-fix):**
2. The active attachment row was missing the type icon and the Remove button `ui-spec.md` §15
   lists. Remove belonging to Issue #16 is fine, but asked for that to be said explicitly, and
   for the icon to be added or dropped from §15.

**Chanat's comments (minor):**
3. `formatBytes` uses 1024-based math while BR-15's 5 MB limit is enforced elsewhere. Asked to
   confirm the two agree, so a file the server accepted never displays as over the limit.

**Chanat's verification (no change requested):** confirmed 403 for an unowned Ticket and 404 for
a missing one per BR-22, with `requesterId` stripped from the response so ownership never leaks;
the non-numeric id path returns 404 before any query; the Requester is re-checked for `isActive`
per BR-06; the screen renders nothing on 403 or 404 per UI-13; the download link already uses the
query-parameter form from `ui-spec.md` §15; removed attachments show the reason with no download
link; and both badges carry their word.

**My response:** Item 1 — added `orderBy: { uploadedAt: 'asc' }` to the attachments select. Item
2 — added a type icon to the active attachment row; left an explicit code comment that Remove is
Issue #16's scope, since this screen stays read-only per `ui-spec.md` §14. Item 3 — confirmed
`formatBytes` already matched `CreateTicket.tsx`'s own helper and BR-15's `5 * 1024 * 1024`
limit; added a comment documenting that agreement rather than leaving it an unstated coincidence.
Chanat approved after the fixes; PR #28 merged into `lab2-staging`.

### Issue 16 — [ShitheadQuin/Toktickit#29](https://github.com/ShitheadQuin/Toktickit/pull/29)

Attachment upload, metadata, download and soft-remove endpoints; wired real upload into Create
Ticket; added the `AttachmentSection` component (add + soft-remove) to Ticket Detail.

**Chanat's comments (blocking):**
1. `.btn-tt-destructive` was used on both Remove buttons but defined in no CSS file — checked
   `theme.css`, `index.css` and `App.css`. Bootstrap has no such class either, so Remove rendered
   with `.btn` styling and no color at all. Same gap for `.tt-attachment-section`,
   `.tt-attachment-list`, `.tt-attachment-row` and `.tt-attachment-divider` — all used, none
   defined. The divider mattered most visually: `ui-spec.md` §14 requires a visible separator
   between Ticket fields and attachment actions, and a bare `<hr>` with no rule is just the
   default hairline.

**Chanat's verification (no change requested):** confirmed BR-27's order is enforced without a
wasted query, by checking type and size with a count of 0 first and only then loading the real
count; BR-26 deletes the stored file when the transaction fails and swallows `ENOENT` so the
compensation cannot mask the original error; BR-24's stored filename is a UUID with the extension
derived from the MIME type, never the client's filename; download treats missing and soft-removed
identically as 404, while `GET` metadata still returns removed rows, matching BR-16 exactly; both
upload and removal bump `updatedAt` inside the same transaction per BR-28; BR-19's retry keeps
the saved Ticket; and the client picker mirrors the server's limits.

**My response:** Defined every class Chanat listed in `theme.css` — `.btn-tt-destructive` as an
outline style matching `#B3261E` per §18, `.tt-attachment-section`/`.tt-attachment-list`/
`.tt-attachment-row` for layout and row separation, and `.tt-attachment-divider` as an actual
visible `border-top` rule (the bare `<hr>` was rendering as an effectively invisible default
hairline against the page background). Also added `.tt-attachment-remove-confirm` for the BR-17
reason prompt, which had the same undefined-class gap. 49/49 client tests still passing. Chanat
approved after the fix; PR #29 merged into `lab2-staging`.

### Issue 17 — [ShitheadQuin/Toktickit#30](https://github.com/ShitheadQuin/Toktickit/pull/30)

Playwright E2E, UI style and responsive evidence in a new top-level `e2e/` package.

**Chanat's comments (blocking):**
1. The busy-state test was named "Submit shows the busy `.tt-busy` state" but only waited for
   the Ticket Number — it never touched `.tt-busy` or the disabled attribute. `tests.md`'s
   STYLE-01 row claims "button states" coverage that didn't exist. Asked to either assert the
   disabled state synchronously right after `click()`, or drop the busy claim from the test name
   and the STYLE-01 row.

**Chanat's comments (should-fix):**
2. `keyboard-nav.spec.ts` wasn't keyboard-driven where it mattered — `select.selectOption()` is a
   programmatic Playwright call, not a key press, and the `ArrowDown` that followed it moved the
   selection again, so the Requester actually submitted wasn't necessarily the one intended.
   AC-26 is about keyboard operability; asked to use key presses and assert the final selected
   value.

**Chanat's comments (minor):**
3. Every suite created Tickets and none cleaned up — RESP-01 alone adds 3 per run, STYLE-02 adds
   3 more. After a few runs the Part 7 My Tickets screenshots would be full of fixture rows.

**Chanat's verification (no change requested):** confirmed `webServer` starts both dev servers
with `reuseExistingServer` so the suite runs against real Postgres, not mocks; E2E-02 proves
cross-Requester rejection through both the list and a direct URL, and checks the summary never
renders; E2E-03 captures the download href before removal and then asserts 404, exactly the
BR-16 evidence Part 8 needs; the asterisk test correctly reads `::after` rather than the text
node; and the overflow check has a sub-pixel tolerance instead of an exact zero.

**My response:** Item 1 — the button's DOM disappears the instant the (locally very fast) request
resolves, so even a synchronous assertion right after `click()` was still racing local Postgres.
Fixed by delaying only the `POST /api/tickets` response via `page.route()`, so the busy window is
long enough to observe deterministically rather than by luck, then asserting `.tt-busy` and
`disabled` before waiting for the (already in-flight) request to finish. Item 2 — replaced
`selectOption()` with two real `ArrowDown` key presses (native `<select>` skips the disabled
placeholder on its own), then read back whichever Requester that actually selected and asserted
that Requester's name appears after submit — proving the keyboard-driven choice, not an
assumption about where it lands, is what got submitted. Item 3 — added
`e2e/global-teardown.ts`: every fixture Ticket across all four specs now carries a shared
`E2E_MARK` prefix, and teardown deletes every Ticket (and its Attachments) carrying it after each
run. Confirmed 10 fixture Tickets removed per full run with no accumulation across repeated runs.
21/21 e2e tests still green. Chanat approved after the fixes; PR #30 merged into `lab2-staging`.
