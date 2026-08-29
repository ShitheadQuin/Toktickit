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
| [#19](https://github.com/ShitheadQuin/Toktickit/pull/19) | feature/10-lab2-spec | lab2-staging | Requested changes (5 points), fix pushed, re-request sent — pending |

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
