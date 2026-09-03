# AI Use — Lab 2

**LLM used:** Claude — Anthropic’s Cowork desktop app (claude-sonnet-5), then the Claude Code CLI

I used Claude as my AI coding assistant across all ten Issues of this sprint (#10 to #18, plus
#24) — through Anthropic’s Cowork desktop app for most of it, then through the Claude Code CLI
from 2026-09-01 onward. I gave it my LAB2_PLAN.md rules up front: follow the labsheet and nothing
else, explain every command in plain words before I run it, never run git commands for me, and
write the code but explain it and wait for my approval before applying it. I also used it to debug
real environment errors, check ambiguous decisions against the labsheet and against my own
specification, API and UI contract documents, and question its own conclusions before I accepted
them.

## Key prompts


| # | Date · Issue | Prompt | What it was for, and what came of it |
|---|---|---|---|
| 1 | 2026-08-30 · #10 | *"what you think?"* — asked about returning 404 vs 403 when a Requester requests a Ticket they don't own | The assistant recommended 403, on the grounds that Parts 6 and 8 need visible evidence that ownership was *enforced*, and a 404 makes an enforced rejection indistinguishable from a missing record. `api-spec.md` was rewritten around 403, and BR-22 and the API-09 test both follow from that one decision. |
| 2 | 2026-08-31 · #12 | *"sure explain first"* | Asked for the explanation before any code. The assistant walked through Issue #12's goal — the Development Requester context standing in for login, plus the selector screen — and the routing and `sessionStorage` architecture it implied, so the design was agreed before it existed in code rather than reverse-engineered from it afterwards. |
| 3 | 2026-08-31 · #12 | *"or just go with presistece if it dont break any rule in labsheet 2"* | I set the constraint; the assistant checked it rather than assumed it. Labsheet §4.2 excludes authentication from Lab 2 entirely, so nothing forbids persisting the selection. `sessionStorage` was chosen over `localStorage` deliberately: per tab, so a new tab has no Requester and the route guard sends it back to the selector. |
| 4 | 2026-08-31 · #11 | *"where is issue 11?"* | I noticed `reviewer.md` jumped from Issue 10 straight to Issue 12, skipping PR #20's review round entirely. The assistant fetched PR #20's real review comments from GitHub and added the missing table row and section. The omission was mine to catch — the assistant had written the file and not noticed the gap. |
| 5 | 2026-08-31 · #13 | (test run) all 7 `create-ticket` tests failing with HTTP 500 | Rather than guessing at the failing assertion, the assistant added full error logging to isolate the actual cause, and found it: `app.ts` never registered `express.json()`, so `req.body` was `undefined` on every POST and Express 5 hid the reason behind a generic 500. A one-line fix took the suite from 7 failing to 12 passing. |
| 6 | 2026-09-01 · #13 | *"which one you recommed"* — where the missing unit tests should live | The assistant recommended adding them to the already-open PR #22, having checked that Chanat hadn't started reviewing it. Then it read `app.ts` and **corrected its own recommendation**: the logic was inline in the route handler, so the change was a small refactor, not the purely additive one it had just claimed. The corrected advice was the one I acted on. |
| 7 | 2026-09-01 · #13 | *"which one you recommed"* — attachment picker: disable it, or say on screen that upload comes later | Chanat's review suggested disabling the picker until Issue #16 implemented upload. Reasonable as code, but it would have made Part 6's "one valid and one invalid attachment selected" screenshot impossible to capture until #16 merged. Chose the on-screen notice, which answers the same concern without destroying already-required graded evidence, and explained the trade-off in the PR rather than refusing silently. |
| 8 | 2026-09-01 · #24 | *"go for this... but check the real work progess with plan first so not thing is wrong"* | Verifying the plan against the actual repository before drafting found that the plan's own justification for BR-26 was half wrong: BR-19 already covered "Ticket created but attachment upload fails". BR-26 was narrowed to the file-versus-database-row compensation that genuinely was undefined. The AI's own planning document turned out to be the thing that needed checking. |
| 9 | 2026-09-01 · #24 | *"what about issue for the docs add br"* | I noticed PR #23 had been opened with no backing Issue, while every other PR in the sprint had one. Issue #24 was created retroactively so the Kanban board stays complete for Part 1. A process gap, invisible in the code, that the assistant had walked straight past. |
| 10 | 2026-09-01 · #14 | (TDD round for the ticket-list API) | Tests were written and committed red first — 16 API cases and 12 unit cases, failing for exactly the right reasons. Writing them caught two things the implementation would not have. `api-spec.md` §4 said bad presentation parameters fall back to defaults and bad filter values return nothing, but never said which rule covers a *malformed* filter — and dropping it would have widened the result set to every Ticket, the one outcome none of these rules should produce, so the rule was documented before the code encoded it. Separately, the assistant's own unit test asserted that a blank filter matches nothing, which would have blanked the screen every time a dropdown was reset to "All"; corrected to treat blank as absent. |

## My Reflection

For Lab 2, I put more effort into planning the work so everything worked well. Even when I got
confused about which step I was on, the AI agent was still able to keep me on the right track
because I had clear rules and a plan to follow. I also learned that giving the AI clear
instructions and checking its suggestions against the labsheet helped me avoid making changes that
were not required.

One thing I learned is that good planning is just as important as using AI. The AI can help solve
problems, but I still need to understand what I am doing and make the final decisions myself.
