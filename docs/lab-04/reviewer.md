# Peer Review: Lab 4


**Reviewer:** Jeerasak Phisawong
**Student ID:** 67070503461
**GitHub username:** ShitheadQuin
**Partner:** Chanat Dachkumhang, Student ID 67070503409, GitHub: @Chanat-888

We each keep our own copy of the repository (`ShitheadQuin/Toktickit` and `Chanat-888/TokTickIT`)
and review each other's Pull Requests for every Lab 4 Issue.

This file is updated as PRs are opened, reviewed and approved during the sprint, not reconstructed
at the end.

## Reviews I gave on my partner's PRs

Pull Requests Chanat authored and I reviewed, targeting his `lab4-staging`:

| PR | Branch | My verdict |
|----|--------|------------|
| [#68](https://github.com/Chanat-888/TokTickIT/pull/68) | feature/lab4-specs | Requested changes (3 points), fixed in `54897de`, approved with 1 non-blocking note, merged |
| [#69](https://github.com/Chanat-888/TokTickIT/pull/69) | feature/lab4-actions-foundation | Requested changes (3 points), fixed in `4879995`, approved with 1 non-blocking note, squash merged |
| [#70](https://github.com/Chanat-888/TokTickIT/pull/70) | feature/lab4-ticket-workflow | Requested changes (3 points), fixed in `2503c88`, approved with 1 non-blocking note, merged |
| [#71](https://github.com/Chanat-888/TokTickIT/pull/71) | feature/lab4-actions-ui | Requested changes (2 points), fixed in `7d072ec`, approved, merged |
| [#72](https://github.com/Chanat-888/TokTickIT/pull/72) | feature/lab4-dashboards | Requested changes (2 points), fixed in `c00ba24`, approved with 1 non-blocking note, merged |
| [#73](https://github.com/Chanat-888/TokTickIT/pull/73) | feature/lab4-hardening | Approved with 1 non-blocking note, merged |
| [#74](https://github.com/Chanat-888/TokTickIT/pull/74) | feature/lab4-reviewer | Approved with 1 non-blocking note, then a follow-up comment asking for the Lab 3 two-section layout; only the smallest point fixed in `1803fdb` so far, open |
| [#75](https://github.com/Chanat-888/TokTickIT/pull/75) | feature/lab4-ai-use | Requested changes (3 points), fixed in `77907f2`, approved, merged |

Chanat's repository numbers its own business rules, sections and tests. Every reference below is
to **his** `specification.md` / `api-spec.md` / `ui-spec.md` / `tests.md`, not to this repository's.

### Sprint 4 engineering contract, [Chanat-888/TokTickIT#68](https://github.com/Chanat-888/TokTickIT/pull/68)

**My comments (requested changes):**
1. `specification.md` BR-14 said `Ticket.updatedAt` changes only when the Ticket's own fields
   change, but Lab 2 BR-39 also changes it on attachment upload and removal, and the Requester's
   resolve indication changes it too. So a Requester uploading a file would give IT Staff a 409 on
   their next status change. Asked whether BR-14 should name these writes or BR-39 should stop
   changing `updatedAt`.
2. `api-spec.md`: the stale check read `expectedUpdatedAt` first and wrote later, so two requests
   could both pass the check before either wrote. Suggested one conditional write
   (`updateMany` on `id` and `updatedAt`, `count === 0` means 409), and pointed out that the owner
   and IT Priority endpoints used a plain update, which would make the concurrency test flaky.
3. `CLAUDE.md` Phase 4 still said "resolution gate" while BR-16 says there is no gate, and no
   phase created `docs/lab-04/tests.md` although the Definition of Done needs it.

**Chanat's response:** Fixed in `54897de`. BR-14 now lists every write that changes `updatedAt`,
BR-39 is kept to avoid Lab 2/3 regressions and the attachment-caused 409 is documented as a
recoverable false positive (§11.6, with AC-17 and API-18/19). The API spec now requires one atomic
`updateMany` on status, owner and IT Priority (BR-17, §11.15), and API-16/17 fire concurrent
same-token pairs expecting exactly one 200 and one 409. Phase 4 is renamed to the transition
matrix and conflict handling, and `tests.md` is now a Phase 1 deliverable in this PR.

**My follow-up:** Confirmed each point on its line.

**My approval:** All three points fixed in `54897de`. Non-blocking note: §11.15 said the status
endpoint "already works this way", but it only checked status, not `updatedAt`, so I asked for a
rewording so nobody skips that change. Approved and merged. Chanat reworded §11.15 in his #69.

### Actions Taken foundation, [Chanat-888/TokTickIT#69](https://github.com/Chanat-888/TokTickIT/pull/69)

**My comments (requested changes):**
1. `server/prisma/seed.ts`: spec §7 says seeded Actions span assigned and unassigned ownership,
   but unassigned Tickets always got zero Actions and only one Ticket got several. Asked for an
   Action on an unassigned Ticket or for §7 to drop "unassigned".
2. `server/src/app.ts`: the server rejected any `idempotencyKey` that is not a UUID, but the API
   spec described it only as a string and did not list that 400 case.
3. The migration folder contained a 2.8 MB course PDF from a commit tied to a different Issue, in
   a public repository. Asked whether it should stay out of the repo with a link instead.

**Chanat's response:** Fixed in `4879995`. Four unassigned Tickets now get one triage Action and
the seed test checks both owned and unowned Tickets. The API spec now says the key is a UUID and
lists the 400 case. The PDF is untracked and gitignored, kept on local disk only.

**My follow-up:** Confirmed each point on its line.

**My approval:** All three points fixed in `4879995`. Non-blocking note: the PDF was still in commit
`d03f768`, so a normal merge would copy it into `lab4-staging` history; I used "Squash and merge" so
it stayed out. Approved.

### Ticket workflow, [Chanat-888/TokTickIT#70](https://github.com/Chanat-888/TokTickIT/pull/70)

**My comments (requested changes):**
1. BR-27 and api-spec §0.4 still said the status filter change was "purely additive", while §2.1
   and §11.17 said `GET /api/tickets?status=RESOLVED` changes from 400 to 200. Asked for the
   exception to be named so the documents agree.
2. The Definition of Done and AC-16 still said Lab 1 to 3 tests pass "unmodified in behavior",
   but the PR edits two Lab 2/3 tests and only §11.17 explained it.
3. §11.16 fixed a no-op `data: {}` on attachment removal, but only upload had a test proving
   `updatedAt` changes. Asked for a removal test checking it strictly increases, or that a stale
   write then gets 409.

**Chanat's response:** Fixed in `2503c88`. BR-27 and §0.4 name the Requester `status=RESOLVED`
exception; AC-16 and the DoD point to §11.17; a removal test asserts `updatedAt` strictly
increases and that a stale IT Priority write then gets 409.

**My follow-up:** Confirmed each point on its line.

**My approval:** All three points fixed in `2503c88`. Non-blocking note: BR-27 cited "§11.16-17",
but only §11.17 covers the status filter. Approved and merged; Chanat will correct the citation on
his #63 branch.

### Actions Taken UI, [Chanat-888/TokTickIT#71](https://github.com/Chanat-888/TokTickIT/pull/71)

**My comments (requested changes):**
1. `ActionsTakenPanel.tsx`: ui-spec §4.3 says the Create form sits above the list, with a pencil
   icon on Edit and a paperclip on Attachment Notes, but the form rendered below the list with
   text instead of icons, and the DoD says screens must match `ui-spec.md`.
2. The idempotency key was kept after a failed save. If the first request did save but its
   response was lost, and the user edited the text and saved again, the server returned the
   original row with 200 and the form cleared, silently losing the edit.

**Chanat's response:** Fixed in `7d072ec` by changing the code: the Create form is above the list,
Edit has a pencil icon with the visible word and an aria-label, Attachment Notes have a paperclip,
and STYLE-05 checks the order and icons. On a 200 the form now keeps the text, shows "This action
was already saved", and rotates the key; UI-20 covers it.

**My follow-up:** Confirmed each point on its line.

**My approval:** Both points fixed in `7d072ec`. Approved and merged.

### Role dashboards, [Chanat-888/TokTickIT#72](https://github.com/Chanat-888/TokTickIT/pull/72)

**My comments (requested changes):**
1. The PR fixed the Lab 2 login wait for the new `/dashboard` landing page, but Lab 3's
   `e2e/lab-03/authentication.spec.ts` still waited for `**/staff/tickets`, so E2E-01 would time
   out. Also §11.17, AC-16 and the DoD said only two Lab 1 to 3 tests change, which was now four.
2. The Accounts card counted only active users, but its drill-down listed inactive users too
   (Requester showed 4 on the card and 5 in the list), against BR-25's "same condition" rule.

**Chanat's response:** Fixed in `c00ba24`. Lab 3 E2E-01 now waits for `/dashboard`, and the docs
list all four edited tests. The Accounts link adds `isActive=true`, the server filters on it and
rejects other values with 400, and a new API test checks the list matches the card count.

**My follow-up:** Confirmed each point on its line.

**My approval:** Both points fixed in `c00ba24`. Non-blocking note: the PR said the E2E suite was
not run, so I asked for one run before the final merge to `main`. Approved and merged.

### Final hardening and regression, [Chanat-888/TokTickIT#73](https://github.com/Chanat-888/TokTickIT/pull/73)

**My approval:** Checked the new E2E specs, the five-test list in §11.17 and the DoD, and several
screenshots; layouts hold at all three widths. Non-blocking: the dashboard screenshots show
Tickets created by E2E runs, so I suggested re-taking them on a fresh seed before the final PDF.
Approved and merged.

### Reviewer log, [Chanat-888/TokTickIT#74](https://github.com/Chanat-888/TokTickIT/pull/74)

**My approval:** Checked each new entry against the PR history; the fix commits, merge types and
comment summaries match. Non-blocking: the #71 section had no "Reviewer decision:" line, unlike
#72 and #73. Approved.

**My follow-up comment:** The file only covered the reviews I gave on his PRs, not the ones he gave
on mine (ShitheadQuin/Toktickit #66 to #69), unlike his Lab 3 `reviewer.md`, which has both
sections. Asked him to follow the Lab 3 layout, add the #74 and #75 entries once settled, and noted
that the "Reviewer decision:" line was missing from #68 to #71, not only #71.

**Chanat's response:** Added the missing "Reviewer decision:" line to the #71 section in `1803fdb`.
The partner-review section, the #74 and #75 entries, and the decision lines for #68 to #70 are
still open on the PR.

### AI use, [Chanat-888/TokTickIT#75](https://github.com/Chanat-888/TokTickIT/pull/75)

**My comments (requested changes):** Checked against labsheet §14 Part 4.
1. Line 3 named Claude and Claude Code but not the model, while the PR description's trailer said
   Claude Sonnet 5. Asked for the model (or models) to be named, since Part 4 asks for the LLM used.
2. End of file: Part 4 asks for a brief "My Reflection" on specification-agent and coding-agent use,
   but all 8 prompts were about the board and GitHub workflow. Asked for a closing reflection on the
   spec and coding agents, or for one or two prompts from that work.
3. Line 176: Prompt 8 said the §11.16-17 citation was one "only #70 fixed", while on #70 he had said
   he would fix it on the #63 branch; BR-27 now cites §11.17 from that later change.

**Chanat's response:** Fixed in `77907f2`, answering each point on its line. The header now names
Claude Sonnet 5 for both working windows, checked against the commit trailers. Prompt 8 now says the
citation named a section #70 did not change and was fixed later on the #63 branch. A closing "My
Reflection" covers the specification agent (the #61 contract and how it held up under review) and
the coding agent (tests first, the defects it caught, and the process corrections it needed).

**My approval:** All three addressed in `77907f2`. Approved, and merged on 28 Sep 2026 (merge commit
`e8d27c2`).

## Reviews my partner gave on my PRs

Pull Requests I authored, reviewed by Chanat, targeting my `lab4-staging`:

| PR | Issue | Chanat's verdict |
|----|-------|------------------|
| [#66](https://github.com/ShitheadQuin/Toktickit/pull/66) | #59 Sprint 4 engineering contract | Approved with 1 non-blocking note, merged |
| [#67](https://github.com/ShitheadQuin/Toktickit/pull/67) | #60 Actions Taken foundation | Approved with 1 non-blocking finding, merged |
| [#68](https://github.com/ShitheadQuin/Toktickit/pull/68) | #61 Actions Taken UI | Approved with 1 non-blocking finding and 1 note, merged |
| [#69](https://github.com/ShitheadQuin/Toktickit/pull/69) | #62 Ticket workflow | Approved with no new findings, merged |
| [#70](https://github.com/ShitheadQuin/Toktickit/pull/70) | #63 Role dashboards | Approved with no findings, merged |
| [#71](https://github.com/ShitheadQuin/Toktickit/pull/71) | #64 Final hardening and regression | Approved with no findings, merged |

### Issue 59, [ShitheadQuin/Toktickit#66](https://github.com/ShitheadQuin/Toktickit/pull/66)

**Chanat's review (approved):** Checked the transition matrix (every status appears once as a
target, Resolved only from In Progress or Waiting, the gate applies again after Reopened), BR-16
stated the same way across all four documents with the serializable transaction closing the race,
every BR-26 drill-down link matching the api-spec examples, and the authorization matrix against
BR-03, BR-22, FR-06 and the navigation in ui-spec §2. Numbering (18 FR, 28 BR, 32 AC) and AC to
test traceability complete.

**His non-blocking note:** api-spec §1 checks `409 STALE_UPDATE` before `403 NOT_TICKET_OWNER`, so a
staff member who is not the owner and sends a stale version learns the Ticket changed before being
told they are not allowed to make that change.

**My response:** Carried into Issue #62, where the Ticket write order changes anyway.

**Merged:** 27 Sep 2026, 23:45:31 (+07), merge commit `60c4ea0`.

### Issue 60, [ShitheadQuin/Toktickit#67](https://github.com/ShitheadQuin/Toktickit/pull/67)

**Chanat's review (approved):** Reviewed the migration, schema, rollback script, `action-rules.ts`,
`routes/actions.ts` and `seed.ts` against the contract: BR-05 to BR-12, BR-19 (version-gated write
closing the race) and BR-20 (`clientRequestId` with a P2002 fallback) implemented as documented,
and the migration and rollback additive only, dropped in the right order.

**His non-blocking finding:** the `TICKET_CLOSED` check on Action create and update reads the
Ticket's status before the write, and only the Action's version is re-checked inside it, so a
Ticket closed by a concurrent request could still get an Action.

**My response:** Agreed on the PR; to be fixed in Issue #62 by re-reading the Ticket's status
inside the same transaction as the write, with a test that closes the Ticket between the check and
the write.

**Merged:** 28 Sep 2026, 00:22:34 (+07), merge commit `21a0366`.

### Issue 61, [ShitheadQuin/Toktickit#68](https://github.com/ShitheadQuin/Toktickit/pull/68)

**Chanat's review (approved):** Reviewed `ActionsTaken.tsx`, `badge-classes.ts`, `theme.css` and the
two page integrations: client validation mirrors BR-06 to BR-08, the per-form `clientRequestId`
plus the submitting guard blocks double submits, the stale banner keeps typed input with Reload,
and the status options come from the same transition table the server enforces.

**His non-blocking finding:** in create mode the assignee defaults to the current user, but the
options come only from the IT Staff list, and the "keep the stored assignee selectable" fallback
exists only in edit mode. Once #62 lets an Administrator reach this page, their own id would have
no matching option.

**His note:** the Cancel confirmation dialog does not trap focus or close on Escape, the same
pattern as Lab 3's status dialog.

**My response:** Replied on the PR: the assignee fallback will be fixed in Issue #62 together with
Administrator access, and every confirm dialog will get a focus trap and Escape in Issue #64, since
our own `ui-spec.md` §13 promises both.

**Merged:** 28 Sep 2026, 00:48:28 (+07), merge commit `3ea5cc1`.

### Issue 62, [ShitheadQuin/Toktickit#69](https://github.com/ShitheadQuin/Toktickit/pull/69)

**Chanat's review (approved):** Reviewed `staff-tickets.ts`, `resolution-gate.ts`, `actions.ts` and the client
status control and history. Confirmed the three notes from earlier PRs are closed: ownership is now
checked before the version on status changes (#66), `writeActionIfTicketOpen` re-checks the Ticket
inside the Action write and takes a row lock (#67), and create mode keeps the signed-in user
selectable as assignee (#68). Checked that the gate is counted inside the same serializable
transaction as the status write with `P2034` surfaced as `STALE_UPDATE`, that claim, reassign,
priority and status all re-check `expectedVersion` in the write, that history rows are written in
the same transaction including on claim, and that the BR-06 minute-precision fix is covered by a
unit test. No new findings.

**My response:** Thanked him on the PR and noted that the dialog focus trap and Escape from #68 are
still planned for Issue #64.

**Merged:** 28 Sep 2026, 01:42:18 (+07), merge commit `d942508`.

### Issue 63, [ShitheadQuin/Toktickit#70](https://github.com/ShitheadQuin/Toktickit/pull/70)

**Chanat's review (approved):** Reviewed `dashboard-queries.ts`, `routes/dashboard.ts`, the
`statusGroup=active` filter on both list endpoints and the client (`Dashboard.tsx` and the filters
read from the page address in `MyTickets.tsx` and `StaffTicketQueue.tsx`). Traced `statusGroup=active`
through to the WHERE clause on both lists and confirmed it uses the same `ACTIVE_STATUSES` constant
as the dashboard counts, so each card and the list it opens agree by construction (BR-23, AC-24).
Also checked: By Status unfiltered with all 8 statuses and zeros, the other figures limited to
active statuses per BR-26, `conflictsWithStatusGroup` matching nothing instead of widening, the
120 character truncation of My Open Actions, the page address being replaced rather than pushed,
and the Queue waiting for the signed-in user before resolving "me". No issues found.

**My response:** Thanked him on the PR for tracing the filter to the WHERE clause; no changes needed.

**Merged:** 28 Sep 2026, 17:50:00 (+07), merge commit `486f3e8`.

### Issue 64, [ShitheadQuin/Toktickit#71](https://github.com/ShitheadQuin/Toktickit/pull/71)

**Chanat's review (approved):** Reviewed the new `ConfirmDialog` and its rollout, the not-found page
and the focus fix. Confirmed the dialog closes the gap he noted on #68: it returns focus to the
opener, starts on Go back so a stray Enter cannot confirm, wraps Tab and Shift+Tab over its own
buttons, and maps Escape to Go back. Called the focus-return change a real bug fix: the old
zero-delay timer raced React's render that brings Add Action back, which only the browser run could
show. The not-found page and the focused read only style were correctly scoped. No issues found.

**My response:** Thanked him on the PR and added a third call site his list missed: the Requester's
"Problem Appears Resolved" confirmation also uses `ConfirmDialog`, and UI-11 covers all three.

**Merged:** 28 Sep 2026, 18:42:56 (+07), merge commit `3567a0e`.
