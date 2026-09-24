# Package Guidelines (`@icebreakers/monorepo-templates`)

This file adds package-local guidance. Global rules are defined in the repository root `AGENTS.md` and still apply.

## Scope

- Package path: `packages/monorepo-templates`
- Purpose: source of workspace assets/templates used by `@icebreakers/monorepo`

## Structure

- `assets/`: upgrade/init assets synced into target workspaces
- `templates/`: project templates used by scaffold flows
- `assets-data.mjs` / `template-data.mjs`: published target registries
- `src/prepare/`: sync pipeline and published-content transformations that rebuild package assets from repo sources

## Local Rules

- Keep `assets-data.mjs` target lists and actual `assets/` files aligned.
- If a new asset is meant to be synced by `monorepo up`, add it to `assets-data.mjs` and ensure it is publishable.
- If `assets/` ignore rules are adjusted, do not accidentally unignore unrelated generated assets.
- For scaffold logic updates, prioritize compatibility with `exactOptionalPropertyTypes` and cover option-edge cases.

## Validation

- `pnpm --filter @icebreakers/monorepo-templates build`
- `pnpm --filter @icebreakers/monorepo-templates lint`
- `pnpm --filter @icebreakers/monorepo-templates typecheck`
