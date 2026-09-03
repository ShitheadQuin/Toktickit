# Peer Review — Lab 2

**Reviewer:** Jeerasak Phisawong
**Student ID:** 67070503461
**GitHub username:** ShitheadQuin
**Partner:** Chanat Dachkumhang — Student ID 67070503409 — GitHub: @Chanat-888

Both partners keep their own copy of the repository (`ShitheadQuin/Toktickit` and
`Chanat-888/TokTickIT`) and cross-reviewed each other's Pull Requests for every Lab 2 Issue.

Filled in as PRs are opened, reviewed, and approved throughout the sprint — not reconstructed at
the end.

## Reviews I gave on my partner's PRs

Pull Requests Chanat authored (reviewed by me). All eleven target his `lab2-staging`:

| PR | Branch | My verdict |
|----|--------|------------|
| [#13](https://github.com/Chanat-888/TokTickIT/pull/13) | feature/lab2-specs | Commented, discussed, then approved |
| [#14](https://github.com/Chanat-888/TokTickIT/pull/14) | feature/lab2-docs | Requested changes (1 point), fixed in `2ab2155`, merged |
| [#24](https://github.com/Chanat-888/TokTickIT/pull/24) | feature/lab2-schema-seed | Requested changes (1 question), answered and documented in `e15894f`, merged |
| [#25](https://github.com/Chanat-888/TokTickIT/pull/25) | feature/lab2-theme-shell | Approved, with one question answered in the thread |
| [#26](https://github.com/Chanat-888/TokTickIT/pull/26) | feature/lab2-requester-context | Requested changes (1 point), fixed in `f601b93`, approved |
| [#27](https://github.com/Chanat-888/TokTickIT/pull/27) | feature/lab2-create-ticket | Requested changes (1 point), fixed in `67fb3eb`, merged |
| [#28](https://github.com/Chanat-888/TokTickIT/pull/28) | feature/lab2-my-tickets | Requested changes (1 point), documented in `82890cd`, approved |
| [#29](https://github.com/Chanat-888/TokTickIT/pull/29) | feature/lab2-ticket-detail | Requested changes (1 point), fixed in `86376ce`, approved |
| [#30](https://github.com/Chanat-888/TokTickIT/pull/30) | feature/lab2-attachments | Requested changes (3 points), fixed in `97fe385`, approved |
| [#31](https://github.com/Chanat-888/TokTickIT/pull/31) | feature/lab2-e2e-visual | Requested changes twice (3 points, then 2 verifications), fixed in `3267817`, approved |
| [#32](https://github.com/Chanat-888/TokTickIT/pull/32) | feature/lab2-release-docs | Requested changes (2 points + 1 minor), fixed in `1e8e474`, approved |

Chanat's repository keeps its own business rules, acceptance criteria and open questions with its
own numbering (BR-38, OQ-5, AC-13 and so on). Every reference below is to **his**
`specification.md` / `api-spec.md` / `ui-spec.md`, not to this repository's.

### Sprint specification — [Chanat-888/TokTickIT#13](https://github.com/Chanat-888/TokTickIT/pull/13)

**My comments:**
1. A business rule about the Requester context reads more like a design note for a later lab than
   something testable, and no acceptance criterion maps to it — suggested moving it to §11
   Assumptions rather than leaving an untested BR.
2. Positive: BR-38 doesn't just state that the Ticket Number must be unique, it explains *why*
   `MAX(id)+1` isn't safe under concurrent requests and why insert-and-retry was chosen over a
   separate Postgres sequence per year. That reasoning is what labsheet §4 asks for, rather than a
   bare rule.

**Chanat's response:** Kept it as a BR, with a reason I accepted — labsheet §4.3 lists "the
transition to real authentication in Lab 3" as one of the required business-rule areas, so moving
it to Assumptions would leave that area with no rule at all. He agreed no AC should map to it,
since it constrains what the Requester context is allowed to be rather than describing an
observable behaviour, and noted it as intentionally untested in `tests.md` so it wouldn't read as a
coverage gap. On BR-38 he added an implementation risk he'd have to watch: the retry must re-read
the sequence *inside* the transaction on every attempt, because reusing a candidate computed before
the first attempt makes every retry collide on the same number and turns the retry bound into a
delayed failure. Approved.

### Contract documents — [Chanat-888/TokTickIT#14](https://github.com/Chanat-888/TokTickIT/pull/14)

**My verification (no change requested):** Checked the two claims the PR description made rather
than taking them on trust. AC traceability was complete — every AC-01 to AC-27 in his `tests.md` §3 maps
to at least one test, and `specification.md` still had exactly 27 ACs, so nothing had silently
changed or gone missing. CSS class names were complete too — I compared all 16 `STYLE-*` rows in
`tests.md` §2.4 against the `ui-spec.md` §19 table one by one, with no missing or extra classes.

**My comment (requested changes):** One inconsistency between the two documents. `tests.md`
API-58/59 expect the exact message `"Missing or invalid idempotency key"`, but `api-spec.md`'s
Idempotency-Key row gave only the condition and not the message — while the `X-Requester-Id` row
directly above it *did* include its exact message. Asked for the same pattern, so that a test
asserting an exact string isn't asserting a string the contract never states.

**Chanat's response:** Fixed in `2ab2155`. Moved the Idempotency-Key 400 into the `api-spec.md` §4
Responses table directly under the `X-Requester-Id` row with the exact message, and removed it from
the field-validation table below — correctly, since Idempotency-Key is a header, not a request-body
field — adding a note that both header 400s are checked before any body field. He also corrected
`tests.md` §8 OQ-TEST-1, which still pointed at the field-validation table where the rule no longer
lived. Merged.

### Database schema and seed — [Chanat-888/TokTickIT#24](https://github.com/Chanat-888/TokTickIT/pull/24)

**My comment (requested changes):** In `server/prisma/seed.ts`, the "Dana Lim" entry is an active
Requester but never appears in `ticketPlan`, so she ends up as a *second* zero-ticket active
Requester alongside Priya. Asked whether that was intentional — extra data for the
dropdown/selector tests — or whether `ticketPlan` should cover her too, since a second accidental
empty Requester would make the empty-state evidence ambiguous.

**My comment (positive):** `createdAt: new Date(base.getTime() + i * 29 * 60 * 60 * 1000)` —
spacing the 30 seeded Tickets 29 hours apart guarantees every `createdAt` is distinct, so sort
order is deterministic instead of depending on insert timing. Good to fix before it becomes a
hidden test bug.

**Chanat's response:** Intentional, with the numbers to back it: `specification.md` §7 sets the
seed minimum at four active Requesters and defines the ~25/~5/0 split over three of them, so Dana
is the fourth and has no Tickets by construction. Priya is the one AC-13 uses for the empty state;
Dana exists so the selector dropdown has a fourth option. Adding her to `ticketPlan` would have
changed the documented distribution. He added a comment above `REQUESTERS` in `e15894f` so the next
reader doesn't have to ask the same question.

### Theme and app shell — [Chanat-888/TokTickIT#25](https://github.com/Chanat-888/TokTickIT/pull/25)

**My verification (no change requested):** Checked both items he flagged — every class in
`components.css` maps exactly to the `ui-spec.md` §19 table with nothing out of scope leaking in,
and the `theme.css` tokens match §1/§2 value for value.

**My comment (positive):** `<NavLink to="/tickets" end>` — the `end` prop is doing real work here.
Without it, My Tickets would stay highlighted on `/tickets/new` and `/tickets/:id` as well, which
breaks the active-page rule in `ui-spec.md` §10.

**My comment (question):** The Change Requester button has no `onClick` wired yet — confirming that
was deferred deliberately rather than an oversight.

**Chanat's response:** Deferred, not an oversight. `ui-spec.md` §10 defines the button as clearing
the stored selection and routing back to the selector, and the `sessionStorage` context it depends
on doesn't exist until his Issue #17 — wiring an `onClick` now would either do nothing or need
rewriting. The Requester name beside it is a placeholder for the same reason, and both become real
in the same commit. Approved.

### Requester context — [Chanat-888/TokTickIT#26](https://github.com/Chanat-888/TokTickIT/pull/26)

**My comment (requested changes):** Not introduced by this PR, but visible while reading
`server/src/app.ts`: the `/api/categories` 500 handler still returned
`{ error: "Unable to load categories" }`, while `api-spec.md` §12 OQ-5 decided that endpoint should
use the generic `"Unexpected server error"` — which `/api/requesters`, directly below it, already
does correctly. Pre-existing drift between two sibling reference-data endpoints and their own
contract, worth a quick fix rather than leaving them inconsistent.

**My comments (positive):**
- The plain `fetch` for `GET /api/requesters` is correct, not a missed header: his `api-spec.md`
  §0.1 explicitly excludes that endpoint from the `X-Requester-Id` requirement, since it is the one
  endpoint that runs *before* a Requester has been chosen.
- Validating the parsed shape with `isSelectedRequester` and catching `JSON.parse` failures means
  corrupted or hand-edited `sessionStorage` degrades to "nothing selected" instead of crashing the
  app on load.

**Chanat's response:** Fixed in `f601b93` — `/api/categories` now returns the generic
`"Unexpected server error"` on 500, matching `/api/requesters` and OQ-5, with nothing else in the
handler changed. Approved.

### Create Ticket — [Chanat-888/TokTickIT#27](https://github.com/Chanat-888/TokTickIT/pull/27)

**My verification (no change requested):** Checked both claims in the actual code rather than the
description. The idempotency replay check runs *before* `validateTicketInput(req.body)`, so a
malformed replay body isn't validated a second time. The attachment checks are in the right order
too — 400 → 404 → 409 → 415 → 413, matching `api-spec.md` §12 OQ-9.

**My comment (positive):** Using Prisma's `err.meta.target` to tell a `ticketNumber` collision apart
from a `(requesterId, idempotencyKey)` collision is the right distinction — the first should retry
with a new Ticket Number, the second means the same request already won the race and the existing
Ticket should be re-fetched and returned as 200. Two unique-constraint violations that need
opposite handling.

**My comment (requested changes):** The multer instance sets no `limits.fileSize`, so a file larger
than the 5 MB business limit is fully buffered into memory before the manual size check ever runs.
Suggested a coarse multer limit well above the real one (10-20 MB) so genuinely oversized uploads
are rejected before they are buffered.

**Chanat's response:** Fixed in `67fb3eb`. Added `limits.fileSize: 20MB` — deliberately coarse and
well above the 5 MB rule, so anything over 20 MB is rejected by multer before being buffered, while
files between 5 MB and 20 MB still pass multer and hit the existing manual 413 check, which keeps
the documented status code. `handleAttachmentUpload`'s error branch was already a catch-all, so
`LIMIT_FILE_SIZE` routes through the same 400 as any other malformed upload with no new branch.

### My Tickets — [Chanat-888/TokTickIT#28](https://github.com/Chanat-888/TokTickIT/pull/28)

**My verification (no change requested):** Verified in the code, not just the description.
`categoryId` here checks only that the Category exists, with no `isActive` check — deliberately
different from `POST /api/tickets`, and matching `api-spec.md` §12 OQ-2. The `orderBy` logic always
appends `{ id: "desc" }` as the second sort key regardless of which `sortBy`/`sortDir` is chosen, so
the OQ-7 tiebreaker genuinely applies to every sort rather than only the default one. The multer
`fileSize` limit from the previous review is present on this branch too.

**My comment (positive):** `requestedPriority` sorts correctly without a separate sort-weight
column. The `Priority` enum is declared `LOW, MEDIUM, HIGH` and Postgres sorts enum values in
declaration order, so `desc` puts HIGH first as `ui-spec.md` OQ-2 requires — the simpler solution,
and it only works because the enum is declared in the right order.

**My comment (requested changes):** On an exact tie — `pageSize=15` being equally close to 10 and
20 — `reduce` keeps the first candidate and clamps to 10. Asked whether round-down is intended or an
artefact of iteration order, since OQ-8 only says "nearest allowed value" and doesn't settle ties,
and suggested a note either way so the behaviour is a decision rather than an accident.

**Chanat's response:** Round-down is intended, not an accident of `reduce`'s iteration order. Fixed
in `82890cd` by adding a comment stating it: OQ-8 leaves ties open, either direction is defensible,
and he picked round-down and documented it rather than leaving it implicit. Approved.

### Ticket Detail — [Chanat-888/TokTickIT#29](https://github.com/Chanat-888/TokTickIT/pull/29)

**My comment (requested changes):** The PR description says a malformed `:id` returns 404, but no
test covered it. Asked for a `GET /api/tickets/abc` → 404 case, so a future refactor can't quietly
turn the documented 404 into a 400 without a test failing.

**My comments (positive):**
- One of the not-found tests compares the response *bodies* as well as the status codes, rather than
  only asserting 404 twice. That actually proves the missing-Ticket and not-owned cases are
  indistinguishable to the caller, which is much stronger evidence for BR-10/BR-36 than matching
  status codes alone.
- Confirmed the 404-for-a-non-numeric-id choice against `api-spec.md` §6, which defines only 200,
  403, 404 and 500 for that endpoint. Returning 404 matches the contract; adding a 400 would have
  been the easy assumption and would have invented a response the spec doesn't define.

**Chanat's response:** Added in `86376ce` — `GET /api/tickets/abc` now asserts 404 with the same
`{ error: "Not found" }` body as the other not-found cases in the file, so a change to 400 would
break the test. Approved.

### Attachments — [Chanat-888/TokTickIT#30](https://github.com/Chanat-888/TokTickIT/pull/30)

**My comments (requested changes):**
1. `requesterId` is passed in the download URL's query string rather than the `X-Requester-Id`
   header every other endpoint uses — raised the browser-history and server-log exposure that comes
   with putting an identity in a URL, and asked whether a blob/object-URL fetch would be preferable.
2. The "Unavailable" pre-check doesn't actually close the race it appears to close: the attachment
   can still be removed after the metadata request succeeds but before the browser follows the
   download URL.
3. `getAttachment` throws on *any* non-OK response, so the caller can't tell a missing or removed
   attachment from a 500 or a network failure. Rendering all three as "Unavailable" tells the user
   the file was removed when the real cause may be that the server is down.

**Outcome:** Points 1 and 2 were kept, with reasons rather than a silent dismissal. On 1, the
download route has to work as an ordinary `<a href>` without JavaScript fetching the file first,
which BR-35 requires; the query parameter is allowed only on that one route via
`allowQueryFallback` and every other route still requires the header, and the Requester context is
itself a temporary stand-in that Lab 3 replaces with real session authentication. On 2, the
pre-check stays as an improvement to the common case — an attachment removed since the page loaded —
while being explicitly *not* treated as a guarantee; the direct navigation can still return 404
inside the small window. Point 3 was fixed in `97fe385`: a dedicated `AttachmentNotFoundError`
thrown by `getAttachment` only on a 404, mirroring the existing `NotFoundError` pattern, so the
Unavailable message and row-disable now fire only on that error or on `meta.isRemoved`, and any
other failure falls through to the real download URL instead of being reported as a removal.
Approved.

### E2E, responsive and screenshot evidence — [Chanat-888/TokTickIT#31](https://github.com/Chanat-888/TokTickIT/pull/31)

**My comments, first round (requested changes):**
1. **Blocking — no test isolation.** E2E-01 creates a real Ticket in the dev database on every run
   and nothing removes it. Reading the initial total instead of hardcoding 25 stops the assertion
   failing, but it treats the symptom: the database still grows by one Ticket per run until it is
   manually re-seeded. That same missing isolation is why the suite needs `fullyParallel: false`,
   and why the 26 screenshots depend on whatever database state happened to exist when they were
   captured. Asked for a `globalSetup` that resets and re-seeds before each run, or at minimum
   cleans up the Tickets the suite creates.
2. Are RESP-01 to RESP-07 screenshot evidence only, or do they use `toHaveScreenshot`? If they are evidence
   only, what actually determines pass or fail? Visibility, collapsed-nav and no-horizontal-overflow
   checks would make them real tests rather than capture steps.
3. E2E-01 to E2E-08 plus RESP-01 to RESP-07 is 15 test IDs, but 22 tests are reported — asked him to confirm the
   difference is parameterisation across viewports rather than an undocumented gap.

**Chanat's response:** Point 1 fixed in `3267817` — a Playwright `globalSetup` that truncates
Ticket/Attachment and re-seeds before every run, so the dev database starts from the exact 25/5/0
shape each time instead of growing by one Ticket per run; with that guaranteed, E2E-04's `>= 25`
workaround was reverted to an exact 25. Point 2: RESP-01 to RESP-07 *are* the real assertions (visibility,
collapsed nav, no horizontal scroll, column presence); the §4 checklist screenshots are separate
capture steps with no pixel-diff, consistent with `tests.md` §7's stated limitation. Point 3:
confirmed — 15 named `test()` blocks plus 7 more that each capture a group of checklist screenshots,
which is 22.

**My comments, second round (requested changes):** Two verifications before merging, both because
the fix is powerful rather than because I doubted it. First, a truncate-on-every-run hook deserves
confirmation that the connection string it uses really is the dev database, and that it is wired
through `globalSetup` in the config rather than being a file that merely happens to be named that.
Second, confirm `3267817` is actually on `feature/lab2-e2e-visual` and the commit count moved from 1
to 2 — my fetch of the PR page was still showing the stale single-commit view, so I couldn't verify
from my side that the fix had landed.

**Chanat's response:** Confirmed both. `globalSetup.ts` uses `server/.env`'s `DATABASE_URL` — the
dev database, never `toktickit_test` — through `npx prisma db execute --stdin --schema
prisma/schema.prisma` with `cwd` set to `server/`, and it is wired in `playwright.config.ts` as
`globalSetup: "./global-setup.ts"`. On the commit, `origin/feature/lab2-e2e-visual` is at `3267817`
on top of `34c476f`, two commits total; a hard refresh cleared the stale page on my end. Approved.

### Release documentation — [Chanat-888/TokTickIT#32](https://github.com/Chanat-888/TokTickIT/pull/32)

**My comments (requested changes):**
1. **The seed-log fix may already be undone.** The closing log was changed from
   `prisma.ticket.count()` to `ticketPlan.length` because the raw count picked up Tickets the E2E
   suite had created against the same dev database — true when it was written, but #31's
   `globalSetup` truncates and re-seeds before every run, so there are no foreign Tickets left for
   the count to pick up. Worse, the two values aren't equally useful: `prisma.ticket.count()` is a
   real query against what is actually in the database, so a silently failed create or a rejected
   row makes the number come back lower and the log says so, while `ticketPlan.length` is the length
   of an array already in memory and prints 30 whether or not a single row was written. The change
   replaced a value that *can* disagree with reality with one that can't. Suggested reverting to the
   raw count, or better, asserting the count equals `ticketPlan.length` and failing loudly on a
   mismatch.
2. **Merge order.** Both this PR and #31 target `lab2-staging` and both touch dev-database seed
   behaviour — this one documents the seed check in the README, #31 changes what the seed state
   actually is at test time. Asked which was intended to merge first, since the wrong order would
   leave the README describing behaviour `globalSetup` had since changed.
3. **Minor:** the README now carries a worked `.env.test` example using the `postgres` role — fine
   for a lab, but worth double-checking there is no real password in it, since the repository is
   public.

**Chanat's response:** Point 1 fixed in `1e8e474`, and better than what I proposed — the log now
prints *both* the seed's own plan size (keeping the 30 / 25-5-0 anchor that makes the breakdown
readable) and a real `prisma.ticket.count()`, with a `console.error` when they disagree, so a silent
create failure surfaces instead of being masked. Point 2: no ordering hazard, because #31 had
already merged into `lab2-staging` before this branch existed, so `globalSetup` was in place when
the seed fix was written. Point 3: confirmed `server/.env.test` was never committed (`git log --all`
shows no history for it) and the README value is documentation, not a credential.

**My approval:** I was wrong on point 2 and said so — I had assumed #31 was still pending when it
had already merged, so no ordering decision was needed. Left one non-blocking follow-up for whenever
`seed.ts` is next touched: the new mismatch warning was firing on a healthy run on his machine (plan
30, database 33) from leftover E2E Tickets, and a warning that fires on every normal run is one
people stop reading — so it won't be noticed when it fires for a real reason. The two directions
aren't equivalent: `count > plan` is expected, since `globalSetup` truncates *before* a run but
nothing cleans up after, while `count < plan` means rows that should exist don't. Warning only on
`count < plan` stays quiet normally and speaks up exactly when something is actually wrong. Approved
and merged.

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
