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

## Generate an affected GitHub Actions matrix

```bash
pnpm exec repo check --affected --base origin/main --matrix
pnpm exec repo check --affected --base origin/main --filter @scope/web --matrix
pnpm exec repo check --affected --base origin/main --matrix --shards 16 --out reports/matrix.json
```

`--matrix` always previews JSON. It runs no checks and does not create or change a workflow; only explicit `--out` writes a report. It requires `--affected` and accepts the same `--base`, `--head`, repeatable `--filter` and `--global-input`. It cannot be combined with `--markdown` or execution-report options. `--json` and `--dry-run` are optional because matrix output already previews JSON.

The public `resolveAffectedCheckMatrix(options)` API returns `schemaVersion: 1`, `provider: "github-actions"`, `hasWork`, `grouping`, `summary`, `matrix: { include: [...] }`, and the complete `affectedPlan`. That embedded plan is identical to `resolveAffectedCheckPlan` for the same inputs, including selection reasons, Git diagnostics and skipped stages. Pass **only `matrix`** to `fromJSON`. Gate the job on `hasWork` before strategy expansion; no changes or no runnable stages produce `hasWork: false` and `include: []`.

Each item has a stable `id`, workspace-relative `packages`, and ordered `commands` containing `executable`/`args`, `targets`, `prerequisiteTargets` and `skipReason`. Execute these arrays from the new checkout's root. The descriptive `command` string is for display, not shell evaluation. Every job keeps **build → lint → typecheck → tsd → test** together. Its build also includes the required internal dependencies, so consumers never wait for artifacts from a different matrix job. Missing scripts retain their reasons; groups with no runnable command are listed in `summary.skippedPackages`.

By default each selected workspace gets one job. `--shards N` (1–256) sorts package directories and distributes them round-robin into at most N groups; it never drops packages. Above GitHub's 256-job limit, generation fails with a request to use `--shards 256` or fewer. The serialized matrix is also checked against the 1 MB job-output limit (estimated as UTF-16), with a small allowance for metadata. Oversized output fails instead of truncating targets; use fewer shards to reduce repeated builds. Every full fallback remains **one complete job**, even with `--shards`: this preserves root scripts and conservatively handles uncertain dependency graphs. Missing or invalid Git refs follow affected mode's full fallback and retain explicit diagnostic codes rather than becoming an empty successful matrix.

This example uses full checkout history and the pull request's base SHA. Each job checks out the same event commit and installs the same lockfile. It requires only `contents: read`; pnpm's store cache does not replace per-job dependency builds. Existing pnpm/Turbo scripts continue to own task ordering and caching. The example targets Linux and sends matrix data through an environment variable into argument-array execution, so paths with spaces, quotes or shell syntax remain data.

```yaml
name: Affected checks
on: pull_request
permissions:
  contents: read
jobs:
  plan:
    runs-on: ubuntu-latest
    outputs:
      matrix: ${{ steps.matrix.outputs.matrix }}
      has-work: ${{ steps.matrix.outputs.has-work }}
    steps:
      - uses: actions/checkout@v7
        with:
          fetch-depth: 0
      - uses: pnpm/action-setup@v6
      - uses: actions/setup-node@v7
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - id: matrix
        env:
          BASE_SHA: ${{ github.event.pull_request.base.sha }}
        run: |
          node --input-type=module <<'JS'
          import { appendFileSync } from 'node:fs'
          import { resolveAffectedCheckMatrix } from 'repoctl'
          const result = await resolveAffectedCheckMatrix({
            cwd: process.cwd(), base: process.env.BASE_SHA, head: 'HEAD', shards: 16,
          })
          appendFileSync(process.env.GITHUB_OUTPUT,
            `has-work=${result.hasWork}\nmatrix=${JSON.stringify(result.matrix)}\n`)
          if (result.affectedPlan.fallback.length) {
            console.error('Full fallback:', JSON.stringify(result.affectedPlan.fallback))
          }
          JS
  checks:
    needs: plan
    if: ${{ needs.plan.outputs.has-work == 'true' }}
    runs-on: ubuntu-latest
    strategy:
      fail-fast: false
      matrix: ${{ fromJSON(needs.plan.outputs.matrix) }}
    steps:
      - uses: actions/checkout@v7
        with:
          fetch-depth: 0
      - uses: pnpm/action-setup@v6
      - uses: actions/setup-node@v7
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - name: Run this job's planned stages
        env:
          MATRIX_JOB: ${{ toJSON(matrix) }}
        run: |
          node --input-type=module <<'JS'
          import { spawnSync } from 'node:child_process'
          const job = JSON.parse(process.env.MATRIX_JOB)
          for (const command of job.commands) {
            if (command.skipReason) continue
            const result = spawnSync(command.executable, command.args, {
              stdio: 'inherit', shell: false,
            })
            if (result.error) throw result.error
            if (result.status !== 0) process.exit(result.status ?? 1)
          }
          JS
```

The planning step uses the API to avoid creating an untracked report before selection. If you use `--out`, write into an ignored report directory. No remote workflow is modified or triggered by matrix generation. See [GitHub matrix syntax](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/run-job-variations) and [Turborepo task execution](https://turborepo.dev/docs/reference/run).

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
