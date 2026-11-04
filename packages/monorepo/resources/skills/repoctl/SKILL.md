---
name: repoctl
description: Create and maintain pnpm/Turborepo workspaces with repoctl. Use when the user says 使用 repoctl 创建项目, create a monorepo, pnpm create repoctl@latest, scaffold Vue/Hono/tsdown/Nimbus/VitePress, or run repo init/doctor/new/check.
---

# repoctl

The package name is `repoctl`. The command is `repo`.

## Empty directory

Create into a new or empty directory outside the repoctl source workspace. Do
not add a business project under the source checkout, and do not point the
create command at a non-empty directory unless the user explicitly asks to
replace it with `--force`. Do not prompt. Map the request to template keys,
then:

```bash
pnpm create repoctl@latest <dir> -- --yes --templates <keys>
cd <dir>
corepack enable
pnpm install
pnpm exec repo init
pnpm exec repo doctor
```

`npm create` and `pnpm create` need the extra `--` before flags. `npx create-repoctl@latest <dir> --yes --templates <keys>` does not.

| User intent              | `--templates` key  |
| ------------------------ | ------------------ |
| Vue / full-stack web app | `vue-hono`         |
| React SSR / App Router   | `next`             |
| API / Hono service       | `hono-server`      |
| TypeScript library / SDK | `tsdown`           |
| Vue component library    | `vue-lib`          |
| Documentation site       | `nimbus`           |
| CLI                      | `cli`              |
| Unspecified              | omit `--templates` |

Then implement the requested feature in the generated workspace.

## Existing repoctl workspace

Look for `pnpm-workspace.yaml` and a `repoctl` / `repo` dependency.

```bash
pnpm exec repo templates
pnpm exec repo new <name> --template <key>
pnpm exec repo check
```

## Verify

```bash
pnpm exec repo doctor
pnpm exec repo check
```

## Preview publication and npm trusted publishing

Upgrade to an official npm release of repoctl containing bootstrap, then preview and apply `repo upgrade`. Review and merge `release.yml` before dispatching; both `bootstrap-publish` and `bootstrap-verify` must pin `REPOCTL_BOOTSTRAP_TOOL_VERSION` to the exact published tool version. A source checkout, linked CLI or copied workflow cannot supply an unreleased tool to these isolated jobs.

Use the managed `release.yml` workflow's `mode=bootstrap` to publish one public workspace package with an explicit prerelease version and a preview tag (default `alpha`). The workflow's `dry-run` previews first. Inside its frozen GitHub context, `repo release bootstrap --package <exact-name> --version <prerelease> --dry-run --json` exposes the plan; without `--dry-run`, the default stage prepares checked artifacts and does not upload. Each package reuses the same workflow and its own npm Trusted Publisher configuration. Keep the formal package versions, intents and ledger unchanged.

`oidc-audit` checks exchange permission; it does not satisfy npm's first successful publish deadline. Recover an accepted upload with `verify-run-id` and its original artifacts, never by rebuilding, uploading again or increasing the version. Read `references/commands.md` before dispatching publication or changing trust settings.

## Do not

- Do not add packages by copying folders.
- Do not hang on create prompts; pass `--yes`.
- Do not create business apps inside the `sonofmagic/repoctl` source repository.

## References

- `references/templates.md` for template keys and `repo new` flags.
- `references/commands.md` for other CLI commands.
- `references/config.md` for `repoctl.config.ts`.
- `references/knip.md` for explicit unused-code checks and reviewed baselines.
