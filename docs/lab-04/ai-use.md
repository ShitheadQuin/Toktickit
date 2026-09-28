# AI Use: Lab 4

**LLM used:** Claude Opus 5.5 (Anthropic model `claude-opus-5-5`), through the Claude Code CLI, for every Lab 4 session

I used Claude as my AI assistant across every Issue of this sprint (#59 to #65). Lab 4 changed how I
worked with it. In Labs 2 and 3 I ran every git command myself; this time I asked the agent to do
the git, GitHub and Kanban work, while I read and approved at fixed points: before each Issue
started, before each push and Pull Request, before anything was posted on GitHub in my name, and
before any screenshot that could not be taken again. It was never allowed to commit to `main` or
`lab4-staging` directly, force-push, approve its own work, or merge without my partner's approval.
I kept the earlier rules that mattered: follow the labsheet and nothing else, write tests before the
code, never let Prisma reset the database, take in-app screenshots with Playwright, and never put an
AI watermark in commits, Pull Requests or code. I also used earlier labs only as a format template;
every decision was checked against the Lab 4 sheet.

## Key prompts

| # | Date · Issue | Prompt | What it was for, and what came of it |
|---|---|---|---|
| 1 | 2026-09-27 · Planning | *"I think just add everything it said cause having it is better than if it need to be graded and dont have"* | The labsheet's §8.3 field list for Actions Taken has no assignee or status, but the Part 6 rubric grades "assign, status transition, complete, cancel, inactive-assignee rejection". The agent pointed out the mismatch before any design work. I chose to add both fields, so every graded item has something to demonstrate. |
| 2 | 2026-09-27 · Planning | *"explain number 2 more I dont understand"* | The labsheet requires a backend "resolution rule" but never says what it is. Asking for a plain explanation with an example made the choice concrete, and I picked the rule: at least one Completed Action and none still Planned or In Progress before a Ticket can be Resolved. |
| 3 | 2026-09-27 · #59 | *"can you take the screenshot first?"* | The spec PR's merge time is Part 2's only proof that the specification existed before implementation. GitHub shows "8 minutes ago", which proves nothing weeks later, so the agent had GitHub's own time labels show the full recorded date and time in the capture. |
| 4 | 2026-09-27 · Workflow | *"for lab 4 you will do even more work for this time I will only read and approve. and also for last lab I always forgot to move the kanban board"* | Changed my Lab 2 and 3 rule that I run every git command. The agent wrote down approval gates and hard limits it may not cross, and found that the GitHub CLI already had project access, so it could move cards itself. |
| 5 | 2026-09-28 · #60 | *"dont need to base on lab 3 that much I just want the format but the work itself follow lab 4"* | Earlier labs became a format template only. Every Issue is now checked against the Lab 4 sheet section by section before its Pull Request. |
| 6 | 2026-09-28 · #60 | *"before anything why when you move the board it not update in the issue history log"* | The agent compared the Issue timelines and found that card moves made through the API leave no "moved from X to Y" entry, while Lab 3's moves made on the website all did. Cards are now moved on the website through the browser, in my own logged-in session. |
| 7 | 2026-09-28 · #62 | *"yeah you can start 62"*, then the full E2E run | Every unit, API and UI test was green, but the end-to-end run in a real browser found two real problems: an Action added in the same minute a Ticket was created was refused (the date field holds whole minutes, the server compared seconds), and a test fixture wrote Bangkok local time into a UTC column, putting its Ticket seven hours in the future. The first was a product bug and was fixed with a test; the second only affected raw-SQL fixtures, which was checked against rows the app itself writes before deciding. |
| 8 | 2026-09-28 · #64 | *"ok let do it now"*, then reviewing the Part 8 and Part 9 screenshots | Final hardening, checked against labsheet §7 and §8.5. The new keyboard test found that focus was lost after saving an Action, which the unit test in jsdom could not show, and the style test found read only fields turning white when focused. Looking at the screenshots myself found two fields cutting their text off; the agent wrote a test that failed on them before fixing either. It also noticed that every test run was overwriting Lab 3's submitted screenshots. |
| 9 | 2026-09-28 · Peer review | *"recheck the pr74 the md file still need the part the he come and comment my work right?"*, then *"just like lab 3"* | My partner's Lab 4 `reviewer.md` only listed the reviews I gave him, not the ones he gave me. The agent compared it with his own Lab 3 file, which has both sections, and the comment I approved asked for the same layout, listing my four PRs by number. |

## My Reflection

For this lab, I chose to let the agent do more of the work on my side, such as running git commands
and checking Issue status, but everything was still under my approval.

The specification agent spotted details in the labsheet that I had missed, and it let me decide how
to deal with them. The coding agent wrote a failing test first, but after that we still ran real
browser tests, so I still need to be careful. I also need to check the Issue status myself. In
previous labs I always forgot to move the cards, so this time I let the agent keep track of them and
move them, but it still made mistakes: once it said it had moved a card, but in reality the status
had not changed.
