# Adopt an existing workspace

## When To Use

Use this task when a workspace already has scripts, hooks, or configuration that you need to keep while introducing repoctl.

## Prerequisites

- Run commands from the workspace root.
- Commit or stash unrelated local changes.
- Confirm that Node.js matches `^22.23.4 || ^24.22.1 || >=26.12.1` (24.22.1 LTS recommended) and pnpm is available.

## Smallest Command

```bash
repo doctor --markdown --redact --out reports/baseline.md
```

## Expected Output

The report records the detected package manager, workspace layout, task runner, tooling files, and release setup without exposing local paths.

## Common Branches

- Existing conventions are healthy: keep them and add only the missing managed assets.
- A file is already managed locally: use `repo upgrade --no-overwrite` and review the diff.
- Tooling is split across loaders: resolve the loader first, then rerun the diagnosis.

repoctl is not only for newly generated repositories. It can be adopted gradually in existing pnpm workspaces by using diagnostics and conservative asset syncs.

## Good Candidates

A repository is a good fit when:

- It already uses pnpm, or is ready to move to pnpm.
- It has a root `package.json`.
- It can use workspace folders such as `apps/*`, `packages/*`, or `examples/*`.
- The team wants stable daily entries such as `repo:init`, `repo:doctor`, `repo:new`, and `repo:check`.

If the repository is not yet a pnpm workspace, start with a minimal `pnpm-workspace.yaml`:

```yaml
packages:
  - apps/*
  - packages/*
```

## Step 1: Install And Setup

```bash
pnpm add -D repoctl
pnpm exec repo init --yes
```

`repo init --yes` uses safe defaults. It adds recommended scripts and workspace patterns, but it does not blindly overwrite existing README, package.json, pnpm-workspace.yaml, or tooling files.

## Step 2: Save The First Diagnostic Report

```bash
pnpm exec repo doctor --markdown --redact --out reports/doctor-before.md
pnpm exec repo doctor --json --out reports/doctor-before.json
```

Prefer saving the first report as a PR comment or CI artifact instead of relying only on terminal output.

Watch these checks:

| Check                        | Common Issue                                                      |
| ---------------------------- | ----------------------------------------------------------------- |
| `package-json`               | Current directory is not the repository root                      |
| `workspace-manifest`         | `pnpm-workspace.yaml` is missing                                  |
| `node-version`               | Root package has no `engines.node`, or the version does not match |
| `tool-package`               | `repoctl` is not installed                                        |
| `root-scripts`               | `repo:init/repo:new/repo:check/repo:doctor` scripts are missing   |
| `config-file`                | A stale `monorepo.config.ts` file is still present                |
| `commit-hooks`               | Lefthook are only partially configured                            |
| `workspace-package-coverage` | Some package.json files are not covered by workspace patterns     |

## Step 3: Sync Conservatively

```bash
pnpm exec repo upgrade --no-overwrite
pnpm exec repo doctor --markdown --redact --out reports/doctor-after.md
```

Use `--no-overwrite` for the first adoption pass. It syncs missing assets while preserving changed managed files.

## Step 4: Preview Verification

```bash
pnpm exec repo check --dry-run
pnpm exec repo check --json --out reports/check-plan.json
pnpm exec repo check --markdown --redact --out reports/check-plan.md
```

Review the plan before wiring hooks or CI.

## Step 5: Use Root Scripts

After `repo init`, team docs can use:

```bash
pnpm run repo:doctor
pnpm run repo:new -- sdk
pnpm run repo:check
```

CI and automation should still prefer explicit commands:

```bash
pnpm exec repo doctor --strict
pnpm exec repo check --full
```

## Step 6: Resolve Legacy Config

### Config Conflicts

Keep only:

```txt
repoctl.config.ts
```

`monorepo.config.ts` is no longer loaded at runtime; rename it to `repoctl.config.ts`.

### Local Tooling Loader

If `doctor` reports local source tooling loaders, migrate with:

```bash
pnpm exec repo upgrade --yes
```

The same migration also converts simple wrappers from `@icebreakers/commitlint-config`, `@icebreakers/eslint-config`, and `@icebreakers/stylelint-config` to `repoctl/tooling`. Complex ESLint configs keep their rules, ignores, overrides, and extra flat config semantics.

### Workspace Pattern Gaps

Run:

```bash
pnpm exec repo init --yes
```

or manually extend `pnpm-workspace.yaml`.

## Recommended PR Shape

1. Install `repoctl` and add root scripts.
2. Attach `doctor-before` and `doctor-after` reports.
3. Sync or migrate tooling config.
4. Wire hooks and CI.
5. Verify scaffolding paths with `repo new --dry-run`.

## Keep Reading

- [Add checks to CI](/tasks/ci)
- [Troubleshoot](/tasks/troubleshooting)
- [Configuration](/reference/config)

For complex workspaces, see [Reuse release and hook automation](./adoption) to replace copied automatic changeset, formal Release PR validation and hooks installer scripts with declarative policy.
