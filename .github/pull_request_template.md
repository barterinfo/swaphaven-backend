## Summary

<!-- What does this PR change and why? -->

## Test plan

- [ ] `npm run typecheck`
- [ ] `npm test`
- [ ] `npm run build`
- [ ] Manual smoke (if API behavior changed): `curl /api/healthz`, relevant endpoints

## Agent review (optional)

- [ ] I reviewed the **Cursor agent review** comment on this PR
- [ ] To auto-apply fixes: add label **`agent-apply`** (requires `CURSOR_API_KEY` secret)

## Checklist

- [ ] Drizzle migrations committed (`drizzle/*.sql`, `drizzle/meta/_journal.json`) if schema changed
- [ ] OpenAPI updated in `src/openapi/spec.ts` if public API changed
- [ ] No secrets in diff (`.env`, keys)
