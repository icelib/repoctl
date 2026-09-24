# Repository Guidelines

This is the **repoctl source workspace**. If a user asked you to create a new
business project, do not add apps here. Use:

```bash
pnpm create repoctl <dir> -- --yes --templates <keys>
```

## Project Structure & Module Organization

This repository is the source workspace for repoctl, a task-first CLI for pnpm and Turborepo monorepos. Product packages live under `packages/`: `repoctl` is the recommended entrypoint, `monorepo` contains the core engine, `monorepo-templates` distributes managed assets, and the create packages provide primary and compatibility bootstrap commands. Private template source workspaces live under `templates/`; they are product assets, not independently published packages. Shared TypeScript and build settings live in root configs such as `turbo.json`, `tsconfig.json`, and `eslint.config.js`.

## Build, Test, and Development Commands

- `pnpm install` — set up workspaces; ensure Node 22.13+ as defined in `package.json`.
- `pnpm dev` — build the repoctl dependency closure, sync template assets, then rebuild changes in dependency order with Turbo watch. Use `dev:create`, `dev:configs`, or `dev:packages` for other package scopes, and `dev:client`, `dev:server`, or `dev:docs` for individual services. See `docs/development.md`.
- `pnpm build` — execute `turbo run build` to build every workspace with caching.
- `pnpm test` / `pnpm test:dev` — run Vitest suites once or in watch mode across packages.
- `pnpm lint` — invoke `turbo run lint` to apply ESLint/Stylelint policies repo-wide.
- `pnpm repo:doctor` — diagnose the source workspace with the same repoctl entrypoint delivered to users.
- `pnpm --filter @icebreakers/monorepo-templates sync:assets` — refresh the managed assets and template copies from repository sources.

## Coding Style & Naming Conventions

Follow the root `.editorconfig`: two-space indentation, LF line endings, UTF-8. Prefer TypeScript (`.ts`/`.tsx`) and Vue SFCs; name files with kebab-case (`user-table.vue`) and exported symbols with PascalCase for components or camelCase for utilities. ESLint (`@icebreakers/eslint-config`) and Stylelint enforce formatting; run `pnpm lint` before committing, and rely on Husky + lint-staged to auto-fix staged files. Any style-related code changes (CSS, SCSS, Less, Vue style blocks, and similar files) must pass Stylelint checks before commit. All changed JavaScript, TypeScript, and Vue code must pass ESLint checks before commit.

`lint-staged.config.js` must include Stylelint checks for staged style files so style validation also runs during pre-commit. It must also route staged TypeScript and Vue files into workspace `typecheck` scripts so Vue workspaces run `vue-tsc` and non-Vue TypeScript workspaces run `tsc`.

When a single code file exceeds 300 lines, treat it as a refactor signal and split it into smaller modules before commit whenever the change touches that area. Do not keep appending responsibilities to an already large file when a folder-based split would make the design clearer.

When splitting code, do not create suffix-based sibling files such as `xxx.config.ts` or `xxx.filter.ts` just to move logic around. Create a dedicated folder (for example `xxx/`) and place the split modules inside it with clear responsibilities.

All generated code must pass ESLint checks, and all generated style files must pass Stylelint checks.
Generated Vue files or other SFC files that include style blocks are also required to pass Stylelint checks.

## Testing Guidelines

Vitest powers unit tests located in `test/*.test.ts`. Mirror existing naming by matching the unit under test (`monorepo` utilities map to `packages/monorepo/test/*.test.ts`). Aim for meaningful assertions rather than snapshot defaults, and add coverage checks with `pnpm test -- --coverage`, which writes reports to `coverage/`. When introducing new public APIs, include integration-style tests in the relevant app workspace. AI-assisted validation must run a full test matrix when available, including unit, integration, and E2E tests.

Before running tests, build the packages first and run tests against build artifacts instead of source-only execution to better match real delivery behavior.

TypeScript issues must be fixed before commit. Do not commit with unresolved TypeScript compile or type-check errors.

TypeScript code must be validated with the relevant workspace `typecheck` script and must not contain type errors. Pure TypeScript workspaces are expected to validate with `tsc` (`pnpm typecheck` or `tsc -p tsconfig.json`). Vue workspaces are expected to validate with `vue-tsc` (typically `vue-tsc -b`).

When building TypeScript libraries (type-focused APIs or public type definitions), add and maintain `tsd` type tests to verify exported type behavior.

## Commit & Pull Request Guidelines

Commits must conform to Conventional Commit syntax; recent history uses prefixes like `feat`, `fix`, and `chore`. Example: `feat(server): add auth router`. Use `pnpm commit` (commitlint prompt) or ensure your manual message passes `pnpm commitlint --edit`. Before opening a PR, make sure `pnpm lint` and `pnpm test` succeed, link related issues, and provide screenshots or logs for user-facing changes. Touching publishable packages requires a pnpm change intent (`pnpm change`) so releases stay traceable.

For AI-generated or AI-assisted changes, use this verification order before commit or PR:

1. Run build first (`pnpm build` or the relevant workspace build command).
2. Run lint checks, ensuring all changed JavaScript, TypeScript, and Vue code passes ESLint and all style-related code passes Stylelint.
3. Run TypeScript checks and fix all type errors before proceeding. Vue workspaces must pass `vue-tsc`; TypeScript workspaces must pass `tsc`.
4. For TypeScript libraries, run `tsd` type tests and fix all failures before proceeding.
5. Run tests against built artifacts, including unit, integration, and E2E suites (when available in the affected workspace).
6. Before commit, review whether the touched files need splitting or refactoring; do not commit avoidable large-file growth when a clearer module boundary is apparent.
