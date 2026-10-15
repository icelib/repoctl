# Template Guidelines (`templates/client`)

This file adds template-local guidance. Global rules are defined in the repository root `AGENTS.md` and still apply.

## Scope

- Template path: `templates/client`
- Purpose: Vue + Vite + Cloudflare Worker client template

## Structure

- `src/`: app UI, pages, router, stores, trpc client
- `worker/`: worker/server entry and router definitions
- `public/`: static assets
- `tsconfig*.json`: split TS projects (`app`, `node`, `worker`)

## Local Rules

- Keep browser code in `src/` and worker runtime code in `worker/`; avoid cross-layer coupling.
- Keep `typecheck` aligned with `vue-tsc -b` and project references in `tsconfig.json`.
- Tailwind ESLint config uses an absolute entry path in `eslint.config.js`; keep that pattern to avoid Lefthook path resolution issues.
- Prefer small feature folders inside `src/` (for example `src/features/<name>/`) when modules grow.

## Validation

- `pnpm --filter @icebreakers/client lint`
- `pnpm --filter @icebreakers/client typecheck`
- `pnpm --filter @icebreakers/client build`
