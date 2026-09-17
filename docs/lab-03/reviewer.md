# Peer Review: Lab 3


**Reviewer:** Jeerasak Phisawong
**Student ID:** 67070503461
**GitHub username:** ShitheadQuin
**Partner:** Chanat Dachkumhang, Student ID 67070503409, GitHub: @Chanat-888

We each keep our own copy of the repository (`ShitheadQuin/Toktickit` and `Chanat-888/TokTickIT`)
and review each other's Pull Requests for every Lab 3 Issue.

This file is updated as PRs are opened, reviewed and approved during the sprint, not reconstructed
at the end.

## Reviews I gave on my partner's PRs

Pull Requests Chanat authored and I reviewed, targeting his `lab3-staging` except the release PR
into `main`:

| PR | Branch | My verdict |
|----|--------|------------|
| [#46](https://github.com/Chanat-888/TokTickIT/pull/46) | feature/lab3-specs | Requested changes (2 points, then 1 follow-up), fixed in `6ad0ad1` and `d9ebd8e`, approved, merged |
| [#47](https://github.com/Chanat-888/TokTickIT/pull/47) | feature/lab3-tests | Requested changes (1 point), fixed in `09bf3e7`, approved with 1 non-blocking follow-up, merged |
| [#48](https://github.com/Chanat-888/TokTickIT/pull/48) | feature/lab3-schema-seed | Requested changes (3 points), fixed in `2e7c3b7`, approved with 1 non-blocking note, merged |
| [#49](https://github.com/Chanat-888/TokTickIT/pull/49) | feature/lab3-auth | Requested changes (3 points), fixed in `4dc3abe`, approved, merged |
| [#50](https://github.com/Chanat-888/TokTickIT/pull/50) | feature/lab3-requester-regression | Requested changes (2 points, then missing tests), fixed in `fb793c0` and `c1e0719`, approved, merged |
| [#51](https://github.com/Chanat-888/TokTickIT/pull/51) | feature/lab3-staff-queue | Requested changes (3 points), fixed in `f798ee4`, approved, merged |
| [#52](https://github.com/Chanat-888/TokTickIT/pull/52) | feature/lab3-staff-ticket-detail | Requested changes (3 points, one of which I had misread), fixed in `a30c583`, approved, merged |
| [#53](https://github.com/Chanat-888/TokTickIT/pull/53) | feature/lab3-admin-users | Requested changes (3 points), fixed in `bb1dad0`, approved, merged |
| [#54](https://github.com/Chanat-888/TokTickIT/pull/54) | feature/lab3-test-suite | Approved with no changes requested, merged |
| [#55](https://github.com/Chanat-888/TokTickIT/pull/55) | feature/lab3-screenshots | Approved with no changes requested, merged |
| [#56](https://github.com/Chanat-888/TokTickIT/pull/56) | feature/lab3-lab2-e2e-fix | Approved with 1 non-blocking note, merged |
| [#57](https://github.com/Chanat-888/TokTickIT/pull/57) | feature/lab3-ai-use | Requested changes (1 point), approved with the point still open, fixed in `a2ea5bd`, confirmed, merged |
| [#58](https://github.com/Chanat-888/TokTickIT/pull/58) | lab3-staging → main | Approved with no changes requested, merged (release) |

Chanat's repository numbers its own business rules and tests (BR-35, API-18 and so on). Every
reference below is to **his** `specification.md` / `api-spec.md` / `tests.md`, not to this
repository's.

### Sprint 3 engineering contract, [Chanat-888/TokTickIT#46](https://github.com/Chanat-888/TokTickIT/pull/46)

**My comments (requested changes):**
1. `api-spec.md`: the Owner control in `ui-spec.md` needs a searchable list of active IT Staff and
   Administrator users, but the only user-list endpoint was `GET /api/admin/users`, which only an
   Administrator can call. IT Staff could not load the users they need to assign a Ticket to.
   Suggested a staff-readable endpoint such as `GET /api/staff/assignable-users`.
2. `api-spec.md`: after a password change, the user's old sessions were still valid. Asked whether
   the endpoint should delete the user's other `Session` rows or at least rotate the caller's
   token, and suggested writing it down as a business rule so the expected behaviour is explicit.

**Chanat's response:** Fixed in `6ad0ad1`. Added `GET /api/staff/assignable-users` to
`api-spec.md` (active IT Staff and Administrator users only, with an optional search parameter),
added the session-invalidation behaviour to the password-change endpoint, and added BR-35 to
`specification.md` §5. I confirmed both on the PR.

**My follow-up comment (requested changes):** The §8 endpoint table in `specification.md` still did
not list `GET /api/staff/assignable-users`, so the two documents no longer matched.

**Chanat's response:** Added the row in `d9ebd8e`, so §8 now matches `api-spec.md`.

**My approval:** All three points addressed (BR-35, the `assignable-users` endpoint and the §8
table row), and the spec documents are consistent. Approved and merged.

### Test DD plan, [Chanat-888/TokTickIT#47](https://github.com/Chanat-888/TokTickIT/pull/47)

**My comment (requested changes):** `tests.md` API-18 expects an already-open session belonging to
a user who has since been deactivated to return `401` immediately. But BR-28 in `specification.md`
only says an inactive user cannot *authenticate*; nothing said `isActive` is checked on later
requests. Asked for a rule saying so, so the test traces back to the specification.

**Chanat's response:** Added BR-36 in `09bf3e7`: `isActive` is checked on every request, so API-18
now has a source in the specification. A later commit, `01e1765`, also covers BR-35 and
`GET /api/staff/assignable-users` in `tests.md`.

**My follow-up comment:** Confirmed BR-36 is in `specification.md` §5, so API-18 now has a
source, and API-65 and API-66 cover the two points from #46. One small gap remained:
`GET /api/staff/assignable-users` only had a `200` case, so I asked for a row covering a Requester
session getting `403` on that endpoint.

**My approval:** All points addressed: BR-36 gives API-18 a source in the specification, and
API-65, API-66 and UI-24 cover BR-35 and the `assignable-users` endpoint. The test plan is complete
and traceable. Approved and merged. The Requester-`403` row for `assignable-users` was left as a
non-blocking follow-up. It was not added before his release: his final `tests.md` on `main` still
has only the `200` case (API-66).

### Data model and migration, [Chanat-888/TokTickIT#48](https://github.com/Chanat-888/TokTickIT/pull/48)

**My comments (requested changes):**
1. `migration.sql`: `specification.md` §7 says emails are stored lowercased, but nothing enforced
   it. `User_email_key` is case-sensitive, so `A@x.com` and `a@x.com` could both exist. Asked for a
   lowercase backfill (`UPDATE "User" SET "email" = LOWER("email")`) and a lowercase unique index or
   `citext`.
2. `schema.prisma`: `Session.expiresAt` had no index, although BR-12 and BR-35 mean expired and
   per-user sessions get deleted often. Suggested `@@index([expiresAt])`.
3. `seed.ts`: seeded Tickets reach `RESOLVED` and `REOPENED`, but `requesterIndicatedResolvedAt` was
   never set, so BR-24 and the Queue flag had no data to exercise.

**Chanat's response:** Fixed in `2e7c3b7`. (1) Lowercased existing emails and added a CHECK
constraint `email = LOWER(email)` instead of `citext`, so every future write is forced lowercase and
the existing unique index is enough; he verified a mixed-case insert now fails. (2) Added
`@@index([expiresAt])` with the matching `CREATE INDEX` in the migration. (3) Seeded Tickets in
`RESOLVED` or `REOPENED` now get `requesterIndicatedResolvedAt` set 6 hours after creation.

**My approval:** All three points addressed. The rename preserves IDs correctly. Approved and
merged. Non-blocking note: Prisma doesn't model CHECK constraints in `schema.prisma`, so watch for
drift if `prisma migrate dev` reports anything on the next migration.

### Authentication foundation, [Chanat-888/TokTickIT#49](https://github.com/Chanat-888/TokTickIT/pull/49)

**My comments (requested changes):**
1. `server/src/app.ts`: BR-09 wants an unknown email and a wrong password to be indistinguishable,
   but an unknown email skipped bcrypt and returned in about 1 ms, against about 300 ms for a real
   email. That timing gap lets someone find out which emails exist. Asked for a dummy
   `bcrypt.compare` against a fixed hash when the user is not found.
2. `server/src/auth.ts`: logging in again didn't delete the previous Session row, and nothing ever
   deleted expired rows, so old tokens stayed valid for the full 12 hours and the table only grew.
   Asked `createSession` to delete that user's expired sessions.
3. `client/src/lib/authContext.tsx`: no global 401 handler. If a session expires or an Administrator
   deactivates the account mid-session (BR-36), the client still thinks it's logged in and requests
   just fail. Asked for any 401 to return the app to Login.

**Chanat's response:** Fixed in `4dc3abe`. (1) An unknown email now runs a dummy `bcrypt.compare`
before returning 401. (2) `createSession` deletes the user's *expired* sessions first; still-active
ones are left for BR-35 to handle at password change. (3) `apiFetch` calls a new unauthorized
handler on any 401 outside `/auth/*`, which sends the user back to Login; `/auth/*` is excluded
because those 401s are real answers, not a dead session.

**My approval:** All three addressed, and the reasoning holds in each case: the dummy compare closes
the timing gap, the session sweep doesn't overlap with BR-35, and excluding `/auth/*` avoids a
refresh loop. Approved and merged.

### Requester regression and Public Comments, [Chanat-888/TokTickIT#50](https://github.com/Chanat-888/TokTickIT/pull/50)

**My comments (requested changes):**
1. `server/src/app.ts`: comment bodies were stored untrimmed. BR-21 already trims for the empty
   check, so asked for storage to match: `(body.body as string).trim()`.
2. `server/src/app.ts`: a second "Problem Appears Resolved" POST overwrote
   `requesterIndicatedResolvedAt` with a later time. The client hides the button, but the endpoint
   stayed open, and BR-24 records when the Requester *first* indicated it. Asked for a repeat call
   to return the Ticket unchanged.

**Chanat's response:** Fixed both in `fb793c0`: bodies are trimmed before storage, and a repeat
call now returns the Ticket unchanged so the first time is kept.

**My follow-up comment (requested changes):** The PR adds two endpoints and a UI panel but no
tests, although `tests.md` already lists rows for comments and the resolve indication. Asked for
the matching API tests in this PR rather than later.

**Chanat's response:** Added `server/tests/lab-03/comments-notes.api.test.ts` in `c1e0719`, covering
API-38 to API-48: access for all three roles, the same comment list for each, empty/whitespace and
2,000/2,001-character validation, a spoofed `authorId` being ignored, and the Closed/Cancelled 404
for resolve-indication. API-41/42 (notes) wait for the notes endpoint in his Issue #41. No new UI
test file, since his `tests.md` doesn't list one for the Requester Ticket Detail.

**My approval:** All three addressed. Agreed to defer API-41/42 until `POST /api/tickets/:id/notes`
exists, and that no UI test is needed here. Approved and merged.

### IT Staff Ticket Queue, [Chanat-888/TokTickIT#51](https://github.com/Chanat-888/TokTickIT/pull/51)

**My comments (requested changes):**
1. `client/src/screens/StaffTicketQueue.tsx`: no guard against out-of-order responses. Two quick
   sort or page clicks can resolve in reverse and leave the older result on screen. Asked for a
   request id or `AbortController` so a stale response is ignored.
2. `StaffTicketQueue.tsx`: changing a filter on page 3 fired one fetch with the old page, then a
   second after the page reset, which wastes a request and briefly shows the wrong rows. Asked for
   the filter handlers to call `setPage(1)` directly instead of in an effect.
3. `server/src/app.ts`: an unrecognized `ownerId` was silently ignored, so a typo returned the whole
   queue, while bad `status` and `itPriority` values return 400. Asked whether `ownerId` should
   match them.

**Chanat's response:** Fixed all three in `f798ee4`. (1) Each request gets an incrementing id and
any response that isn't the latest is dropped, with a regression test that resolves two requests in
reverse order. (2) The filter handlers and search debounce reset the page directly, with a test that
a filter change on page 2+ sends exactly one request. (3) `ownerId` is validated with the other
filters and returns 400 unless it's `unassigned` or an integer, covered in `staff-queue.api.test.ts`.

**My approval:** All three addressed, and the regression tests for each are a good addition.
Approved and merged.

### IT Staff Ticket operations, [Chanat-888/TokTickIT#52](https://github.com/Chanat-888/TokTickIT/pull/52)

Claim and reassign, IT Priority, the status workflow, Public Comments and Internal Notes on his
side of the lab.

**My review (changes requested), three points:**
1. **`server/src/app.ts`, the status PATCH was read-then-write with no guard.** Two staff acting at
   once can both pass the transition check against the same old status, and the second write
   silently wins. Suggested `updateMany({ where: { id, status: ticket.status } })` and a 409 when it
   matches nothing.
2. **`server/src/app.ts`, the staff detail returned soft-removed Attachments** while the Requester
   detail filters `removedAt: null`, and `api-spec.md` §3 does not say either way. Asked whether it
   was intended, and said that if so the UI has to mark them.
3. **`client/src/screens/StaffTicketDetail.tsx`, each handler merged only its own field back into
   state**, so a change another staff member made since page load stays stale on screen. Suggested
   replacing the whole ticket from the response, or refetching after a successful write.

**Chanat's response:** Fixed the conditional update and the stale-state merge in `a30c583`, and pointed out that
I had misread the Requester handler on point 2, both views intentionally return removed rows with
`isRemoved`, and the UI marks them. He also dropped a flaky spy-based test rather than leave
unstable mocks in place.

**My approval:** He was right about the attachments and I said so. The conditional `updateMany` is
the correct pattern, and dropping the flaky test rather than stabilising a bad mock was the right
call. Approved; merged 15 Sep.

### Administrator User Management, [Chanat-888/TokTickIT#53](https://github.com/Chanat-888/TokTickIT/pull/53)

His Administrator screen: listing, creation, editing, activation and a new initial password.

**My review (changes requested), three points:**
1. **An admin-initiated password reset did not end the target user's sessions**, so anyone already
   signed in as that account stays signed in for up to 12 hours, while BR-35 does exactly that for
   a self-initiated change. Asked whether the endpoint should reuse the same session-deletion logic.
2. **The same read-then-write gap as #52's status PATCH**, here on the last-active-Administrator
   check: two admins demoting each other at once can both count one other active admin and both
   succeed, leaving zero. Suggested a conditional update, or wrapping the count and the update in
   one transaction.
3. **`client/src/screens/UserManagement.tsx` had no stale-response guard**, unlike his
   `StaffTicketQueue`, so fast typing in the search box can let an older result land last.

**Chanat's response:** Fixed all three in `bb1dad0`. Used `deleteAllSessions` for the reset, moved the admin check to Serializable
isolation with `P2034` mapped to the same 409, and reused the `latestRequestId` pattern in the
search box.

**My approval:** `deleteAllSessions` is right here because there is no caller session to preserve,
and Serializable with P2034 → 409 handles the write-skew case cleanly. I agreed with him that a
timing-based race test was unnecessary, the sole-admin tests plus the isolation level already
cover it. Approved; merged 16 Sep.

### Test suite, [Chanat-888/TokTickIT#54](https://github.com/Chanat-888/TokTickIT/pull/54)

His unit, API, component, style and E2E suites for Lab 3.

**My review (approved, no changes requested):** I cross-checked every Test ID in his `tests.md`
against the files actually on the branch, all covered, and the new suites match his spec. I also
agreed that his Lab 2 E2E-06/07/08 rewrite belongs in a separate task
rather than being folded into this PR, and noted his catch on the login fixture hang.

**Chanat's response:** None needed.

**My approval:** Approved; merged 16 Sep.

### Screenshots and visual inspection, [Chanat-888/TokTickIT#55](https://github.com/Chanat-888/TokTickIT/pull/55)

RESP-06, his screenshot checklist against `ui-spec.md` §8, deliberately deferred out of #54: 40
captures across five folders, plus the `responsive-visual.spec.ts` that produces them.

**My review (approved, no changes requested):** Everything works and matches his spec. All 40
captures are present across the five folders and the paths in `responsive-visual.spec.ts` match the
files that land. Adding a fifth `requester-ticket-detail/` folder beyond §8's literal four was the
right call, since §5.4's Public Comments tab and "Problem Appears Resolved" button have no home in
the original four. I also noted his catch that the `/admin/users` forbidden state comes from
`RequireAdmin` rather than `UserManagement.tsx`.

**Chanat's response:** None needed.

**My approval:** Approved and merged into his `lab3-staging` at 2026-09-16 14:58:47 UTC.

### Lab 2 E2E repair, [Chanat-888/TokTickIT#56](https://github.com/Chanat-888/TokTickIT/pull/56)

Removing the Development Requester selector broke his Lab 2 E2E-06, E2E-07 and E2E-08 and the Lab 2
Requester Selection screenshot checklist. E2E-06 and E2E-08 now switch Requester through a real
login, E2E-07 was rewritten against the Login screen, and the checklist block for the removed
screen was dropped. One commit (`49eb716`).

**My review (approved, no changes requested):** The rewrites describe accurately what changed, and
documenting E2E-07's reachability limit inline follows the same approach as his API-58/59 tests.
Non-blocking note: his Phase 10 Definition of Done asks for the Lab 2 E2E suite to pass
*unmodified*, but this PR has to modify it because BR-15 removed the screen those tests targeted.
I asked him to say so in the release PR, so it doesn't look like tests were changed just to make
them pass. I also noted that he reverted the Lab 2 PNGs a full run had regenerated by accident,
rather than silently changing already-graded Lab 2 evidence.

**Chanat's response:** None needed.

**My approval:** Approved and merged into his `lab3-staging` at 2026-09-16 15:38:48 UTC.

### AI use, [Chanat-888/TokTickIT#57](https://github.com/Chanat-888/TokTickIT/pull/57)

His `docs/lab-03/ai-use.md`: eight prompts from across the sprint and his reflection.

**My comment (requested changes):** The intro pointed to `docs/lab-03/reviewer.md`, and that link
returned 404. A broken link in the intro is the first thing a grader would click.

**Chanat's response:** He answered that the file existed and the 404 was a delay on GitHub's side,
with `curl` checks returning `200 OK`. His checks were against `ai-use.md` itself, though, not the
`reviewer.md` path the intro linked to.

**My approval:** The format matches his Lab 2 `ai-use.md` and the prompts are real, so I approved,
but said the `reviewer.md` link was still unresolved because we had been checking different files,
and asked him to fix the path or drop it before submission.

**Chanat's response:** He confirmed `docs/lab-03/reviewer.md` had never been pushed to any branch,
and reworded the intro without the path in `a2ea5bd`.

**My follow-up:** Confirmed the reworded intro has no path left to 404. Merged into his
`lab3-staging` at 2026-09-17 09:17:35 UTC.

### Lab 3 release, [Chanat-888/TokTickIT#58](https://github.com/Chanat-888/TokTickIT/pull/58)

His release from `lab3-staging` into `main`.

**My review (approved, no changes requested):** Every phase PR had already been reviewed and
approved individually, so this is a roll-up of checked work. The Lab 2 E2E modification from #56 is
called out explicitly, which was the one thing I wanted carried into the release notes. Full suite
green (220 server, 77 client, 45 E2E), and the evidence and `ai-use.md` are in place.

**Chanat's response:** None needed.

**My approval:** Approved and merged into his `main` at 2026-09-17 09:21:31 UTC.

## Reviews my partner gave on my PRs

Pull Requests I authored and Chanat reviewed:

| PR | Branch | Base | Reviewer verdict |
|----|--------|------|-------------------|
| [#33](https://github.com/ShitheadQuin/Toktickit/pull/33) | feature/32-lab3-spec | lab3-staging | Requested changes (3 blocking, 1 should-fix, 1 question), fixes pushed in `65068cb`, approved, merged into lab3-staging |
| [#42](https://github.com/ShitheadQuin/Toktickit/pull/42) | feature/34-user-migration | lab3-staging | Approved with no changes requested, merged into lab3-staging |
| [#43](https://github.com/ShitheadQuin/Toktickit/pull/43) | feature/35-auth | lab3-staging | Requested changes (0 blocking, 4 should-fix, 1 minor), fixes pushed in `2e26120`, approved, merged into lab3-staging |
| [#44](https://github.com/ShitheadQuin/Toktickit/pull/44) | feature/36-authorization | lab3-staging | Requested changes (1 should-fix, 1 minor), fixes pushed in `98813f4`, approved, merged into lab3-staging |
| [#45](https://github.com/ShitheadQuin/Toktickit/pull/45) | feature/37-staff-queue | lab3-staging | Approved with no changes requested, merged into lab3-staging |
| [#46](https://github.com/ShitheadQuin/Toktickit/pull/46) | feature/38-staff-detail | lab3-staging | Approved with no changes requested, merged into lab3-staging |
| [#48](https://github.com/ShitheadQuin/Toktickit/pull/48) | feature/47-staff-detail-polish | lab3-staging | Approved with no changes requested, merged into lab3-staging |
| [#49](https://github.com/ShitheadQuin/Toktickit/pull/49) | feature/39-user-admin | lab3-staging | Approved with no changes requested, merged into lab3-staging |
| [#50](https://github.com/ShitheadQuin/Toktickit/pull/50) | feature/40-e2e-visual | lab3-staging | Approved with no changes requested, merged into lab3-staging |
| [#51](https://github.com/ShitheadQuin/Toktickit/pull/51) | feature/41-release | lab3-staging | Approved with no changes requested, merged into lab3-staging |
| [#52](https://github.com/ShitheadQuin/Toktickit/pull/52) | lab3-staging | main | Approved with no changes requested, merged into main (release) |
| [#54](https://github.com/ShitheadQuin/Toktickit/pull/54) | fix/server-typecheck | lab3-staging | Approved with no changes requested, merged into lab3-staging |

### Issue 32, [ShitheadQuin/Toktickit#33](https://github.com/ShitheadQuin/Toktickit/pull/33)

The Sprint 3 engineering contract: `specification.md`, `api-spec.md`, `ui-spec.md` and `tests.md`,
with no implementation code, merged first so its timestamp shows the specification came before
implementation.

**Chanat's comments (blocking):**
1. `tests.md` marked every test "Pass", but the PR added no test files. That contradicts
   `tests.md` §6's own rule that a row moves to Pass only once its test exists and passes. Asked
   for every row to be "Planned".
2. FR-13 said "IT Staff/Administrator set IT Priority", contradicting BR-15, the IT-Staff-only
   `PATCH /staff/tickets/:id/priority` in `api-spec.md` §4, the §7 authorization matrix, and
   `specification.md` §11's decision that Administrator does not perform IT Staff Ticket operations.
3. Pagination field names disagreed: `specification.md` §11 said `totalCount`, but the response
   example in `api-spec.md` §4 used `totalItems`.

**Chanat's comments (should-fix):**
4. The PR description said 25 ACs, but `specification.md` §9 has 28 (AC-01 to AC-28).

**Chanat's question:** Several decisions cite labsheet sections (§4.3 and §4.5 on Administrator
Ticket access, §6 on initial-password issuance, §8.5 and §8.6 on the user list and the feedback
matrix). Asked me to confirm them against the handout.

**Chanat's verification (no change requested):** confirmed the 401/403/404 split, ownership taken
from the session rather than supplied by the client, Internal Notes structurally excluded from
Requester responses, the Administrator safety rules and their `409` codes and tests, the status
transition matrix, the additive-only migration and idempotent seed, the login security rules
(generic error, timing-safe check, throttling, bcrypt cost 12), traceability for all 28 ACs, and
all eight required test levels.

**My response:** Checked every point against the documents before changing anything, and all four
were correct. Fixed in `65068cb`:
1. Every row in `tests.md` is now "Planned".
2. Removed Administrator from FR-13. Searching for the same mistake found it in three more places:
   FR-12 (reassigning a Ticket to an Administrator), FR-15 (Administrator posting Comments and
   Notes) and the claim/reassign line in §11. The endpoint summary also let Administrator post
   Internal Notes. All are now IT Staff only; Administrator can still *read* Comments and Notes,
   as the labsheet's BR-04 requires.
3. `api-spec.md` §4 now uses `totalCount`, matching `specification.md` §11.
4. PR description updated to 28 ACs.

On the question, the citations are correct. Quoting the labsheet confirmed one thing worth writing
down: §4.5 *allows* Administrator to own Tickets and change IT Priority, and our matrix narrows both
to IT Staff, which §4.3 permits ("unless the approved authorization matrix explicitly permits it").
Added a sentence to `specification.md` §11 saying this explicitly. Re-requested review; Chanat
approved and merged PR #33 into `lab3-staging`.

### Issue 34, [ShitheadQuin/Toktickit#42](https://github.com/ShitheadQuin/Toktickit/pull/42)

The User model, the Lab 2 → Lab 3 migration and the seed. Committed as failing tests first
(`0bd4e4a`, MIG-01 to MIG-03), then the implementation (`bde235c`).

**Chanat's review (approved, no changes requested):** He checked the schema, `migration.sql`, the
seed, `seed-credentials.ts`, `app.ts`, the updated Lab 2 tests and the migration regression test
himself. He confirmed:
- the Requester → User rename keeps every id and foreign key;
- the migration's bcrypt hash matches the documented password;
- role scoping is applied everywhere, with no leftover `prisma.requester` calls;
- the seed counts match labsheet §5.3;
- `tests.md` marks only the three tests this PR actually implements as Pass.

**My response:** None needed. Chanat merged PR #42 into `lab3-staging`.

### Issue 35, [ShitheadQuin/Toktickit#43](https://github.com/ShitheadQuin/Toktickit/pull/43)

Login, logout, current user and the forced first-login password change. Committed as failing
tests first (`d879c64`), then the implementation (`85bb2f8`).

Chanat diffed the PR against `lab3-staging` and ran the suites on a fresh local database: client
54/54, `e2e/lab-03/authentication.spec.ts` passing, and this PR's own new tests 24/24. The server
suite had 2 failures that he reproduced on `lab3-staging` before this PR.

**Chanat's comments (blocking):** None.

**Chanat's comments (should-fix):**
1. Login and the throttle compared email case-sensitively, so typing a different case than stored
   gave a false invalid-credentials error, although BR-19 commits to case-insensitive emails.
2. The session's sliding expiry was extended in the database on every request, but the `sid`
   cookie's own expiry was set once at login, so an active user was still logged out at exactly 12
   hours.
3. `api-spec.md` §3 cited "Issue #35" for the 404-vs-403 change, which this PR doesn't make.
4. `tests.md` still said "Planned" for the tests this PR delivers.

**Chanat's comments (minor):**
5. `tests.md` described API-02 as covering response time, but the test only checks that the
   messages match.

**Chanat's verification (no change requested):** the timing-safe login, the throttle order and
window, bcrypt cost 12 with no password logging, `requireAuth`/`requirePasswordChanged` wired
correctly (with applying them to Lab 2 routes held for #36), cookie settings matching the spec, the
Zen Green classes, and no scope creep.

**My response:** All five points were correct. Fixed in `2e26120`:
1. Email is trimmed and lowercased before the lookup and before it's used as the throttle key, with
   a new test for a differently-cased login.
2. `getSessionUser` returns the refreshed expiry and `requireAuth` re-sets the cookie with it on
   every authenticated request, with a new test.
3. The citation now says Issue #36.
4. UNIT-01, UNIT-04, API-01 to API-08, UI-01, UI-02 and E2E-01 flipped to Pass.
5. API-02's expected result reworded to what the test asserts; timing stays verified by code
   review.

I also traced his 2 server failures to an existing Lab 2 test-isolation problem:
`my-tickets.api.test.ts` creates a temporary Requester that races with `requesters.api.test.ts`'s
exact-count check when Vitest runs files in parallel. It wasn't caused by #35, so I left it out of
this PR. Posted the reply on the PR; Chanat approved and merged PR #43 into `lab3-staging`.

### Issue 36, [ShitheadQuin/Toktickit#44](https://github.com/ShitheadQuin/Toktickit/pull/44)

Server-side authorization on every Lab 2 endpoint, role-based navigation, removal of the
Development Requester selector, and the Requester regression pass (commit `4abbf63`).

**Chanat's comments (should-fix):**
1. `AppShell.tsx:75` used `className="tt-badge tt-badge-role"`, but `.tt-badge-role` doesn't exist
   in `theme.css`, so every role badge rendered with no background or text color. `ui-spec.md`
   §9/§14 call for `.tt-badge-role-requester` / `-it-staff` / `-administrator`. He noted it's the
   same "undefined class" bug that recurred in Lab 2.

**Chanat's comments (minor):**
2. The IT Staff (`/staff/queue`) and Administrator (`/users`) nav links pointed to routes that don't
   exist until #37/#39, so clicking them showed a blank page. Suggested a placeholder or a disabled
   state until those Issues land.

**Chanat's verification (no change requested):** every Lab 2 Requester and Attachment endpoint runs
`requireAuth` → `requirePasswordChanged` → `requireRole('REQUESTER')`, takes ownership from
`req.user.id` only, and returns 404 for another Requester's records (BR-12/BR-03); both #43 fixes
carry through and are tested; the Development Requester selector is fully removed with no dead
references; `RequireRole` redirects correctly for the unauthenticated, must-change-password and
wrong-role cases; and API-09, API-10 and API-15 hit the real app, with API-11 to API-14 correctly
deferred to Issues #37, #38 and #39.

**My response:** Both points were correct. Fixed in `98813f4`:
1. The role badge now uses the three §14 classes, with §9 colors in `theme.css`. Checking it showed
   the status badges had the same problem, which the review hadn't mentioned: only
   `.tt-badge-status-new` was defined, and the pages built class names from the raw enum
   (`in_progress`, `waiting_for_requester`) instead of §14's `-in-progress` and `-waiting`. All 8
   statuses and 3 roles now go through one mapping, `client/src/components/badge-classes.ts`, and
   each has a CSS rule. To stop the bug recurring, the new STYLE-03 test
   (`client/tests/lab-03/badge-classes.test.ts`) reads `theme.css` and fails if any mapped class has
   no rule; I confirmed it fails when a rule is removed.
2. `/staff/queue` and `/users` are now role-guarded routes inside the shell with a placeholder, which
   #37 and #39 replace.

The same commit also carries fixes from my own check of the branch: the 9 Lab 2 screenshots the
rewritten responsive spec had overwritten are restored and the spec no longer writes there;
`tests.md` rows for this PR's tests flipped to Pass, with UI-09's path corrected; a Planned A11Y-01
row replaces the deleted keyboard spec's coverage; and the README no longer lists that spec.
Client 56/56, E2E 21/21. Posted the reply and re-requested review; Chanat approved and merged PR #44
into `lab3-staging`.

### Issue 37, [ShitheadQuin/Toktickit#45](https://github.com/ShitheadQuin/Toktickit/pull/45)

The IT Staff Ticket Queue: `GET /api/staff/tickets` and the Queue screen. Committed as failing tests
first (`f896cbc`), then the queue decisions in the docs (`37d451e`), then the implementation
(`0e37a8e`).

**Chanat's review (approved, no changes requested):** He reviewed the server authorization and query
logic and spot-checked the client against `api-spec.md` §4 and `ui-spec.md` §6. He confirmed:
- the endpoint is IT Staff only, with 403 for Requester and Administrator;
- invalid `status`/`itPriority`/`owner` values give zero results rather than 400, search covers ticket
  number, summary, description and requester name/email, and sorting breaks ties on `id`;
- the Prisma enum declaration order really matches the documented sort order (New → Cancelled,
  Low → High), which he noted is easy to get silently wrong;
- the `ticket-list-helpers.ts` change only exports existing helpers, with no behavior change to My
  Tickets;
- the client guards against out-of-order responses, keeps empty and no-results states distinct, and
  shows a safe error with retry instead of the empty state when a request fails;
- every `tt-*` class the Queue uses has a rule in `theme.css`, so the undefined-badge-class problem
  from #44 did not come back.

**My response:** None needed. Chanat merged PR #45 into `lab3-staging`.

### Issue 38, [ShitheadQuin/Toktickit#46](https://github.com/ShitheadQuin/Toktickit/pull/46)

The IT Staff Ticket Detail (claim, reassign, IT Priority, status workflow, Public Comments, Internal
Notes, read-only Attachments) and the Requester's side (Public Comments panel and "Problem Appears
Resolved"). Nine commits: the contract fixes first (`909a41c`), then failing tests before each
implementation step, server (`6dc98f1`, `e447869`, then `3cf573f`), Staff Ticket Detail screen
(`30e242c`, then `8fb52e2`), Requester side (`8ef2058`, then `a920ca3`), and E2E-02 with the
`tests.md` results (`af65eb1`).

**Chanat's review (approved, no changes requested):** He reviewed the status transition matrix
fixes (the added Reopened → In Progress and owner New → Open rows), the atomic claim and status
writes, and the guard that refuses Internal Notes to a Requester with `403` before any Ticket is
looked up, and found all of them correct.

**My response:** None needed. Chanat merged PR #46 into `lab3-staging`.

### Issue 47, [ShitheadQuin/Toktickit#48](https://github.com/ShitheadQuin/Toktickit/pull/48)

An extra Issue, not in the sprint plan. Raised from two defects found while capturing the Part 7
evidence for #38: the Claim and "Assign to" controls wrapped onto separate lines, and the 409
conflict message showed raw enum codes instead of status names. Fixed tests-first (`77c3e9c`, then
`34663ef`). The same branch also fixed an intermittent client test that chose a reassign option
before the staff list had loaded.

**Chanat's review (approved, no changes requested):** "Verified all three fixes (Claim button
layout, human-readable transition-error message, and the real race-condition root cause behind the
flaky test), all correct; approving."

**My response:** None needed. Chanat merged PR #48 into `lab3-staging`.

### Issue 39, [ShitheadQuin/Toktickit#49](https://github.com/ShitheadQuin/Toktickit/pull/49)

Administrator User Management: the list with search and an optional role filter, create with one
role and a generated initial password, basic editing, activation, and a new initial password,
plus the two safety rules. Three commits, docs then failing tests then implementation (`a01f2fc`,
`0560d07`, `5c55ad5`).

**Chanat's review (approved, no changes requested):** "Verified the last-active-admin race handling
(serializable transaction), self-deactivation precedence, BR-22 field whitelisting, and session
invalidation on password reset, all correct; approving."

**My response:** None needed. Chanat merged PR #49 into `lab3-staging`.

### Issue 40, [ShitheadQuin/Toktickit#50](https://github.com/ShitheadQuin/Toktickit/pull/50)

E2E, responsive and visual evidence: RESP-01, STYLE-01/02 and A11Y-01 as three new Playwright
specs, the Lab 2 flake fixed ahead of the final run from `main`, the §12 visual checklist
completed, and the two UI defects the visual pass turned up. Six commits: the Lab 2 flake fix and
fixture teardown (`e029a77`), the first RESP-01 captures (`5f350b5`), the UI fix (`0be4165`),
RESP-01 recaptured with a non-destructive admin fixture (`732d363`), STYLE and A11Y (`cd75c03`),
and docs (`4e38a4c`).

**Chanat's review (approved, no changes requested):** "Verified both UI fixes (status-column width,
email word-break) and the teardown/test additions are sound and honestly documented, approving."

**My response:** None needed. Chanat merged PR #50 into `lab3-staging` at 2026-09-16 14:20:59 UTC
(merge commit `9bd1a5b`).

### Issue 41, [ShitheadQuin/Toktickit#51](https://github.com/ShitheadQuin/Toktickit/pull/51)

The two submission documents, this `reviewer.md` and `ai-use.md`, promoted from the working drafts
kept in `.agents/` during the sprint. One commit (`4ea0379`).

**Chanat's review (approved, no changes requested):** "Spot-checked reviewer.md's claims against
the real GitHub data (my own review threads and the Chanat-888/TokTickIT PRs) and they hold up
accurately — approving."

**My response:** None needed. Chanat merged PR #51 into `lab3-staging` at 2026-09-16 15:56:52 UTC.
This section and the two below were added after that merge, so the file also records the reviews
of the last two PRs.

### Issue 53, [ShitheadQuin/Toktickit#54](https://github.com/ShitheadQuin/Toktickit/pull/54)

The server typecheck. `tsconfig.json` set `"module": "nodenext"` while `package.json` set
`"type": "commonjs"`, so `npx tsc --noEmit` reported 320 errors and hid real ones. Changing the
module setting to `"preserve"` left 9 genuine type errors, all fixed, including the broken `User`
import in `src/middleware.ts` that meant `req.user` was never actually typechecked. One commit
(`f04229c`).

**Chanat's review (approved, no changes requested):** "Ran tsc myself on both branches and
confirmed 320→0, and the two real fixes (UserModel import, sequence-read guard) are correct, not
just noise suppression — approving."

**My response:** None needed. Chanat merged PR #54 into `lab3-staging` at 2026-09-16 16:15:21 UTC
(merge commit `caa87fe`).

### Issue 41 release, [ShitheadQuin/Toktickit#52](https://github.com/ShitheadQuin/Toktickit/pull/52)

The Lab 3 release from `lab3-staging` into `main`, carrying every Sprint 3 Issue merged above.

**Chanat's review (approved, no changes requested):** Approved without a written comment.

**My response:** None needed. Chanat merged PR #52 into `main` at 2026-09-16 16:20:28 UTC (merge
commit `8c880e5`), so the release was not self-merged.
