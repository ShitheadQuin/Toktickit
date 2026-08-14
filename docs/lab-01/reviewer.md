# Peer Review — Lab 1

**Reviewer:** Jeerasak Phisawong
**Student ID:** 67070503461
**GitHub username:** ShitheadQuin
**Partner:** Chanat Dachkumhang — GitHub: @Chanat-888

Both partners maintain their own copy of the repo (`ShitheadQuin/Toktickit` and `Chanat-888/TokTickIT`) and cross-reviewed each other's Pull Requests for all four Issues.

## Reviews I gave on my partner's PRs

### Issue 1 — [Chanat-888/TokTickIT#5](https://github.com/Chanat-888/TokTickIT/pull/5)

**My comment:** The `.env.example` connects using the `toktickit` role, but the README only showed how to create the `toktickit` database — no `CREATE ROLE` step, so a fresh setup would fail on auth.

**Response:** Chanat confirmed the gap and pushed a fix adding `CREATE ROLE` before `CREATE DATABASE`, plus a note for anyone reusing an existing role, and added the missing `client/.env.example` copy step to the README.

I also left a positive comment noting Bootstrap was actually wired into `App.tsx` (not just installed) — approved.

### Issue 2 — [Chanat-888/TokTickIT#6](https://github.com/Chanat-888/TokTickIT/pull/6)

**My comment:** No timeout on the health-check fetch — if the backend hangs instead of refusing the connection, does the UI ever leave the loading state?

**Response:** Chanat agreed a hung backend would leave the UI loading forever, since a stopped server refuses immediately (which is why local testing hadn't caught it), and added `AbortSignal.timeout(5000)`.

I also confirmed the offline message was intentionally generic instead of exposing the raw fetch error — approved.

### Issue 3 — [Chanat-888/TokTickIT#7](https://github.com/Chanat-888/TokTickIT/pull/7)

**My comment:** The seed loop awaits each upsert sequentially instead of using `Promise.all` — is that to guarantee ids are assigned 1–4 in order for Issue 4? If so, it should probably be commented so no one parallelizes it later and breaks the order.

**Response:** Chanat confirmed that was exactly the reason and added a comment in the seed script warning against switching to `Promise.all`.

I also confirmed the `upsert()` keyed on unique `name` correctly makes the seed idempotent — approved.

### Issue 4 — [Chanat-888/TokTickIT#9](https://github.com/Chanat-888/TokTickIT/pull/9)

**My comments:** Raised how the UI should handle the empty-state case if `/api/categories` ever returns zero rows, and confirmed the per-fetch `AbortSignal.timeout` pattern was applied consistently to both the health and categories calls.

**Response:** Chanat replied to both points and the changes were merged after discussion — approved.

## Reviews my partner gave on my PRs

Pull Requests I authored (reviewed by my partner):

| PR | Branch | Base | Reviewer verdict |
|----|--------|------|-------------------|
| [#5](https://github.com/ShitheadQuin/Toktickit/pull/5) | feature/1-project-foundation | lab1-staging | Approved, after three inline comments and a fix commit |
| [#6](https://github.com/ShitheadQuin/Toktickit/pull/6) | feature/2-health-check | lab1-staging | Approved, after one inline comment and a fix commit |
| [#7](https://github.com/ShitheadQuin/Toktickit/pull/7) | feature/3-category-seed | lab1-staging | Requested changes, then approved after the comment was withdrawn |
| [#8](https://github.com/ShitheadQuin/Toktickit/pull/8) | feature/4-category-list | lab1-staging | Approved, with one non-blocking comment and a follow-up fix |
| [#9](https://github.com/ShitheadQuin/Toktickit/pull/9) | lab1-staging *(Lab 1 release)* | main | Approved |

### Issue 1 — [ShitheadQuin/Toktickit#5](https://github.com/ShitheadQuin/Toktickit/pull/5)

**Chanat's comments:** The PR description read `Closes#1` with no space, so GitHub wasn't linking it to Issue 1; `client/.gitignore`'s `*.local` pattern didn't cover a plain `.env` file; and the stock Vite `client/README.md` was still in place, contradicting the real setup instructions in the root README.

**My response:** Added the space (`Closes #1`), added an explicit `.env` rule to `client/.gitignore`, and deleted the stray `client/README.md`. Chanat re-reviewed and approved after the fix commit.

### Issue 2 — [ShitheadQuin/Toktickit#6](https://github.com/ShitheadQuin/Toktickit/pull/6)

**Chanat's comment:** No timeout on the health-check fetch — a hung backend would leave the UI on "Loading..." indefinitely instead of showing an error.

**My response:** Added `fetch('/api/health', { signal: AbortSignal.timeout(5000) })` so a hung backend now surfaces through the existing catch block into the offline state — approved.

### Issue 3 — [ShitheadQuin/Toktickit#7](https://github.com/ShitheadQuin/Toktickit/pull/7)

**Chanat's comment:** `npx prisma db seed` needs a `"prisma": { "seed": ... }` block in `server/package.json`, and it wasn't there, so the seed command looked undocumented/unrunnable — requested changes.

**My response:** I re-ran `npx prisma db seed` live and pasted the output showing it resolves through `prisma.config.ts`'s `migrations.seed` field, which is where Prisma 7 moved seed configuration (the old `package.json` block is no longer used). Chanat re-checked, confirmed Prisma 7's convention, withdrew the comment, and approved.

### Issue 4 — [ShitheadQuin/Toktickit#8](https://github.com/ShitheadQuin/Toktickit/pull/8)

**Chanat's comment:** The Supertest assertions hardcoded exact autoincrement ids (`{ id: 1, name: '...' }`, etc.). Postgres `SERIAL` sequences don't reset on delete or re-seed, so the test would pass on a fresh database but fail on any database that already had rows inserted — even though the endpoint itself is correct.

**My response:** Agreed and rewrote the test to assert on the array of `name`s in order, plus a loose `typeof id === 'number'` check per row, instead of hardcoding ids — approved.

## Summary

Across all four Issues, review comments went both directions and led to real changes: timeout handling on both PRs' health checks, a documentation comment on seed ordering, a live-tested correction of a Prisma 7 seed-config misunderstanding, and a fix to make the categories test robust against non-reset `SERIAL` sequences.
