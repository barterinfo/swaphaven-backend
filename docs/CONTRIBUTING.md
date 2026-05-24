# Contributing

## Development workflow

1. Branch from `main`
2. Make focused changes; run `./deploy/scripts/release.sh` before push
3. Open a PR — CI runs typecheck, tests, build, health smoke, and harness sync
4. Address **Cursor agent review** comments (posted automatically on each PR)

Full guides: [docs/README.md](./README.md)

---

## Agent harness (like barter-stack)

This repo uses the [agent harness framework](https://www.npmjs.com/package/@madebywild/agent-harness-framework) for Cursor rules, skills, hooks, and GitHub automation.

| Command | Purpose |
|---------|---------|
| `npm run harness:validate` | Check `.harness/manifest.json` |
| `npm run harness:apply` | Regenerate `.cursor/` from `.harness/src/` |
| `npm run harness:check` | Validate + apply + fail if managed files drift |

**Edit sources in `.harness/src/`**, then run `npm run harness:apply` and commit both `.harness/` and generated `.cursor/` files.

The Cursor provider auto-generates **hooks** and **skills** only (`npm run harness:check` tracks those paths). **Commands** (`.cursor/commands/`), **system prompt** (`.cursor/prompt.md`), and **rules** (`.cursor/rules/`) must be kept in sync manually with `.harness/src/commands/`, `.harness/src/prompts/system.md`, and preset rules when you change harness sources.

### PR agent review

On every non-draft PR, **Agent PR review** workflow:

1. Posts a comment with **Summary**, **Must fix**, **Should fix**, **Nits**
2. Each blocking item includes **How to fix**

To let the bot push fixes:

- Add label **`agent-apply`**, or
- Set repo variable **`AGENT_AUTO_APPLY=true`**

Requires GitHub secret **`CURSOR_API_KEY`** ([Cursor dashboard](https://cursor.com/dashboard)).

### CI auto-fix

When **CI** fails on a PR branch, **Agent fix CI** may push a fix commit (same `CURSOR_API_KEY` requirement). Opt in with label **`agent-fix`** or repo variable **`AGENT_AUTO_FIX=true`** (mirrors the `agent-apply` gate on review apply).

---

## Code conventions

- TypeScript strict; Zod for request bodies
- Routes in `src/routes/`; schema in `src/db/schema/`
- Tests in `tests/` with Vitest + Supertest
- Barter-compatible listing payloads: `src/lib/barter-listing.ts`

See `.cursor/rules/backend-architecture.mdc` (generated from harness).

---

## Mobile client (barter-stack)

The Flutter app lives in **barter-stack/mobile**. Point `API_BASE` at this API:

```env
# barter-stack/mobile/lib/config/env/dev.env
API_BASE=http://127.0.0.1:3001
```

Production: Railway HTTPS URL from [DEPLOYMENT.md](./DEPLOYMENT.md).
