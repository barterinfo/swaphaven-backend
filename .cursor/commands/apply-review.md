---
description: Apply review.md recommendations with minimal code changes
---

# apply-review

Read `review.md` and implement fixes.

## Scope

- Apply **Must fix** and **Should fix** items with small code changes.
- Skip **Nits** unless trivial.
- Edit `src/`, `tests/`, `drizzle/`, and `docs/` only when the review requires it.
- Do **not** edit `.github/workflows/` — list those under **Manual steps**.

## Output

Write `fixes-applied.md`:

1. **Applied** — changes made
2. **Skipped** — items not applied and why
3. **Manual steps** — author follow-up (migrations, Railway vars, etc.)

## Restrictions

- Do NOT commit, push, or use `gh` in this step.
- The GitHub Actions apply job commits after verification.
