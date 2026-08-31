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
| [#21](https://github.com/ShitheadQuin/Toktickit/pull/21) | feature/12-requester-context | lab2-staging | Requested changes (3 points), fixes pushed, approved, merged into lab2-staging |

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
