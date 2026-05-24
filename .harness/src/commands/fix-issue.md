---
description: Investigate a bug and implement the smallest fix with tests when applicable
---

# fix-issue

1. Reproduce or reason about the failure from code and logs.
2. Locate root cause in `src/` or `tests/` — do not guess.
3. Implement the narrowest fix.
4. Add or update Vitest tests when behavior is testable.
5. Run `npm run typecheck` and `npm test` before finishing.

Do not expand scope beyond the reported issue.
