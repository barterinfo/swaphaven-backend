---
description: Review the PR diff for bugs, security, regressions, migrations, and scope — write review.md
---

# review-pr

Review the pull request for **swaphaven-api**.

1. Inspect the diff (and `pr-context.md` if present).
2. Apply the **reviewer** skill: bugs and regressions first; check Drizzle migrations and barter API compatibility.
3. Flag scope creep and missing Vitest tests.
4. Write `review.md`:

## Summary
(1–2 sentences)

## Must fix
(blocking — each item includes **How to fix**: files, commands, migration steps)

## Should fix
(non-blocking — each item includes **How to fix**)

## Nits
(optional)

Be specific with file paths and line references. Do not request drive-by refactors.
