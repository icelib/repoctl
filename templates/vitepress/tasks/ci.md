# Add checks to CI

## When To Use

Use this task when local commands are ready and the same repository policy must run on every pull request or branch.

## Prerequisites

- A passing `repo check --dry-run` plan.
- A CI runner with Node.js, pnpm, and the repository lockfile.
- Non-interactive credentials for any publish or release job.

## Smallest Command

```bash
repo check --full --json --out reports/check-plan.json
```

## Expected Output

CI receives a stable plan and can upload the JSON or Markdown report as an artifact. The same command remains runnable locally.

## Common Branches

- Pull requests need a fast gate: use `repo check --staged` or the repository's pre-commit mode.
- Main branch needs a delivery gate: use `repo check --full`.
- A release job needs a version plan: run `repo release plan --json` before publishing.

repoctl commands have two audiences: humans using short daily commands, and automation consuming stable reports.

## Local Daily Workflow

```bash
pnpm install
pnpm run repo:doctor
pnpm run repo:new -- sdk --template tsdown
pnpm run repo:check
pnpm build
```

| Step                   | What It Proves                                          |
| ---------------------- | ------------------------------------------------------- |
| `pnpm install`         | Workspace dependencies and local links are ready        |
| `pnpm run repo:doctor` | Root files, Node, scripts, config, and hooks are usable |
| `pnpm run repo:new`    | New packages follow template conventions                |
| `pnpm run repo:check`  | The lightweight local verification flow is reproducible |
| `pnpm build`           | The workspace build graph has no obvious breakage       |

## Adopt An Existing Repository

```bash
pnpm add -D repoctl
pnpm exec repo init --yes
pnpm exec repo doctor --markdown --out reports/doctor.md
pnpm exec repo upgrade --no-overwrite
pnpm exec repo doctor
```

Start conservatively with `--no-overwrite`. After reviewing asset drift, decide whether `--yes` or `--overwrite` is appropriate.

## Fast CI Gate

```bash
pnpm install --frozen-lockfile
pnpm exec repo doctor --strict
pnpm exec repo check --full
```

This is a simple gate for small repositories or early projects. `doctor --strict` treats warnings as failures.

## CI Report Mode

```bash
pnpm exec repo doctor --json --out reports/doctor.json
pnpm exec repo check --json --out reports/check-plan.json
pnpm exec repo env support --markdown --redact --out reports/support.md
```

Use these outputs as CI artifacts:

- `doctor.json` for scripts.
- `check-plan.json` to explain verification routing.
- `support.md` for issues, PRs, and external collaboration.

## Hooks

```bash
repo verify pre-commit
repo verify staged-typecheck packages/app/src/main.ts
repo verify commit-msg .git/COMMIT_EDITMSG
repo verify pre-push
```

| Stage      | Recommended Behavior                                      |
| ---------- | --------------------------------------------------------- |
| pre-commit | Focus on staged files, lint, and workspace typecheck      |
| commit-msg | Enforce Conventional Commit messages                      |
| pre-push   | Run root lint/typecheck and affected build/test/tsd tasks |

## Non-Interactive Options

| Scenario                              | Option                                             |
| ------------------------------------- | -------------------------------------------------- |
| Accept setup defaults                 | `repo init --yes`                                  |
| Preserve changed files during upgrade | `repo upgrade --no-overwrite`                      |
| Explicitly overwrite standard assets  | `repo upgrade --yes` or `repo upgrade --overwrite` |
| Preview only                          | `--dry-run`                                        |
| Output for scripts                    | `--json --out <file>`                              |
| Share a redacted report               | `--markdown --redact --out <file>`                 |

## Documentation Worker

The repoctl documentation is deployed as the `repoctl-docs` Cloudflare Worker. VitePress produces static assets, and Workers Static Assets serves them without an application handler or an `ASSETS` binding.

### Workers Builds settings

| Setting               | Value                                                   |
| --------------------- | ------------------------------------------------------- |
| Repository root       | Repository root                                         |
| Production branch     | `main`                                                  |
| Build command         | `pnpm --filter @icebreakers/website build`              |
| Production deploy     | `pnpm --filter @icebreakers/website run deploy`         |
| Non-production deploy | `pnpm --filter @icebreakers/website run deploy:preview` |

The build command checks locale parity before VitePress generates `.vitepress/dist`. The Worker config serves the generated `404.html` for missing routes and keeps `public/_redirects` active for legacy `/en/*` links.

### Preview, release, and rollback

Run a local validation before changing production:

```bash
pnpm --filter @icebreakers/website build
pnpm --filter @icebreakers/website run deploy:dry-run
pnpm --filter @icebreakers/website exec wrangler dev
```

Non-production Workers Builds upload a preview version. Promote a validated build through the production deploy command. To roll back, inspect the version history and select the last known-good version:

```bash
pnpm --filter @icebreakers/website exec wrangler versions list
pnpm --filter @icebreakers/website exec wrangler rollback <VERSION_ID>
```

`repoctl.icebreaker.top` is the canonical custom domain. Cloudflare Redirect Rules send `repo.icebreaker.top/*` and `monorepo.icebreaker.top/*` to the canonical host with a permanent redirect while preserving the path and query string.

## Keep Reading

- [Command Reference](/reference/commands)
- [Troubleshoot](/tasks/troubleshooting)
- [Command Aliases](/reference/aliases)
