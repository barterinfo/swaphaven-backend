---
description: Fix CI failures from workflow logs with minimal changes
---

# fix-ci

Fix a failed GitHub Actions run for **swaphaven-api**.

1. Read the CI log (typecheck, build, vitest, harness drift, or health smoke).
2. Fix only what is required. Common fixes: Postgres test DB, missing migration journal, `harness:apply` drift.
3. Re-run failing commands mentally or locally before finishing.
4. Summarize: root cause, files changed, commands that should pass.

Restrictions in CI:

- Modify source files only. Do not commit/push — the workflow handles git.
- Do not edit `.github/workflows/` unless the failure is clearly a workflow bug.
