# Troubleshoot

## When To Use

Use this task when initialization, checks, templates, or automation stop with an unexpected result.

## Prerequisites

- Run the command from the repository root.
- Keep the original error and the repository revision available.
- Remove secrets before sharing command output.

## Smallest Command

```bash
repo doctor --markdown --redact --out reports/doctor.md
```

## Expected Output

The report identifies the repository root, package manager, workspace configuration, tooling, and the first failing check.

## Common Branches

- The command is run from a child directory: change to the workspace root.
- A config file conflicts with a managed asset: inspect the plan before overwriting.
- A template key is unknown: list templates with `repo templates`.

repoctl focuses on reports that can be reproduced, saved, and shared.

## Start With Doctor

```bash
repo doctor
repo doctor --strict
```

`doctor` checks:

- Current directory and repository root.
- Node.js version.
- `pnpm-workspace.yaml`.
- The `repoctl` CLI dependency.
- Recommended root scripts.
- Conflicting config files.
- Lefthook wiring.

## Save A Diagnostic Report

```bash
repo doctor --json --out reports/doctor.json
repo doctor --markdown --redact --out reports/doctor.md
```

Markdown reports are useful in issues and PRs. `--redact` removes local absolute paths.

## Inspect The Verification Plan

```bash
repo check --dry-run
repo check --json --out reports/check-plan.json
repo check --markdown --redact --out reports/check-plan.md
```

Use this when you need to understand why a file triggers a workspace typecheck or which tasks pre-push would run.

## Collect Environment Information

```bash
repo env info
repo env support --markdown --redact --out reports/support.md
repo env snapshot --json --out reports/snapshot.json
repo env paths --markdown --redact --out reports/paths.md
```

These commands help compare local, CI, Git, Node, pnpm, and workspace differences.

## Common Fixes

### Not At Repository Root

Change into the directory that contains `pnpm-workspace.yaml` and the root `package.json`, then run:

```bash
repo doctor
```

### Conflicting Config Files

Keep only:

```txt
repoctl.config.ts
```

`monorepo.config.ts` is no longer loaded at runtime; rename it to `repoctl.config.ts`.

### Unknown Template Key

List available templates:

```bash
repo templates
```

Explicit `--template` values are validated first. Invalid keys fail with suggestions.

### Automation Should Not Prompt

Use non-interactive options:

```bash
repo init --yes
repo upgrade --no-overwrite
repo check --json --out reports/check-plan.json
```

## Keep Reading

- [Add checks to CI](/tasks/ci)
- [Command Reference](/reference/commands)
- [Command Aliases](/reference/aliases)
