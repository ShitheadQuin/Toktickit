# AI Use and Reflection — Lab 1

I used Claude (model `claude-sonnet-5`) through Anthropic's Cowork desktop app as my AI coding assistant across all four Issues. I gave it my HANDOFF.md ground rules up front — follow the labsheet only, explain every command before I run it, and let me write the code myself unless I explicitly ask for it (with a later rule letting me switch to "just do it" mode when needed) — and used it to debug real environment errors, resolve ambiguity by pointing it back at the spec, and question its own conclusions before trusting them.

## Selected Key Prompts

### Issue 1 — Project foundation

**1. Set a ground rule for delegating work**

**Prompt:** "for the ground rule add in that let user select what he want like if he told claude do the part u do it cause sometime there an accident that he cant finish the work"

**My Reflection:** This is where the explain-only vs. just-do-it mode distinction got written into HANDOFF.md as its own ground rule, after an earlier moment where I'd asked it to just do something and it pushed back. Having an explicit rule meant I could switch modes going forward without re-litigating it each time.

**2. Set up a clean handoff to a new chat**

**Prompt:** "let start issue 2 at the new chat set it up for me pls"

**My Reflection:** It wrote an updated HANDOFF.md capturing the ground rules, current repo state, gotchas hit so far, and Issue 2's requirements, so the next chat could pick up without re-explaining everything — this became the pattern I reused at the start of every later session.

**3. Recheck completed work before trusting it**

**Prompt:** "can you recheck the issue 1 code again cause Im not sure is it right or wrong?"

**My Reflection:** Rather than just re-asserting it was fine, it re-read every relevant file directly off disk and checked each of Issue 1's seven acceptance criteria one by one with specifics (file, line, what was verified), instead of giving a vague "looks good."

### Issue 2 — API health check

**1. Debug a live connection issue**

**Prompt:** "Can you go check?" (after a proxy/connection error appeared in the browser)

**My Reflection:** It couldn't drive my browser directly, so it told me exactly what to open in DevTools instead of guessing. The diagnosis (client dev server had been killed by reusing its terminal) was correct once I pasted the console output.

**2. Resolve ambiguity by following the spec**

**Prompt:** "I'm not sure just follow the labsheet." (when asked whether to add two optional Vitest UI tests now or defer them)

**My Reflection:** Instead of guessing at "best practice," telling it to just follow the spec resolved the ambiguity cleanly — Issue 2 only required the Supertest test, so the Vitest ones stayed deferred to Issue 4.

### Issue 3 — Category model, migration, and seed

**1. Debug a database permission error**

**Prompt:** (pasted a Prisma `P3014` shadow-database error after running `prisma migrate dev`)

**My Reflection:** Instead of guessing, it explained *why* the error happened (shadow database needs `CREATEDB` privilege) before giving the fix, and correctly worked around `psql` not being on my PATH by finding the actual install path first.

**2. Verify before disputing a review comment**

**Prompt:** "should we recheck?" (before replying to a reviewer comment I believed was based on outdated Prisma assumptions)

**My Reflection:** Rather than just asserting I was right, it had me re-run the actual command live and pasted that fresh output into the reply — much stronger than arguing from memory, and the reviewer confirmed and approved once they saw it.

### Issue 4 — Categories API and UI

**1. Debug a flaky test**

**Prompt:** (pasted a `TestingLibraryElementError: Found multiple elements` failure on the second/third `App.test.tsx` test)

**My Reflection:** It correctly diagnosed that React Testing Library's automatic cleanup hook never registers because Vitest's `test.globals` isn't enabled, and fixed it by explicitly importing `cleanup` and calling it in `afterEach` — a subtle config interaction I wouldn't have guessed.

**2. Verify merge state instead of assuming**

**Prompt:** "can you check have I merged yet?"

**My Reflection:** It checked the PR page directly rather than taking my word for it.

## Reflection
Making a plan before starting the lab makes the workflow smoother, saves time, and helps me avoid mistakes. It also makes it easier to track my progress throughout the work. What worked best was asking Claude to verify its own conclusions instead of just trusting them. For example, I rechecked Issue 1's code file by file, reran the seed command before disputing a review comment, and checked the actual PR page instead of assuming the merge had gone through. This "prove it, don't just assert it" approach helped catch real mistakes along the way. My prompts also became more specific as I went. Early on, vague questions usually gave me vague answers, but later I told Claude exactly what to check and how to work, which reduced the back-and-forth.