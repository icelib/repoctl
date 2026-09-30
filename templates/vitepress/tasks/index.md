# Task index

Start here when you know what you want to do, but not which repoctl command to use.

## I Just Opened A Repository

```bash
pnpm install
pnpm run repo:doctor
```

If the `repo:*` scripts do not exist yet:

```bash
pnpm add -D repoctl
pnpm exec repo init --yes
pnpm exec repo doctor
```

Continue with [Install and initialize](/start/install).

## I Want To Adopt repoctl In An Existing Repo

```bash
pnpm add -D repoctl
pnpm exec repo init --yes
pnpm exec repo doctor --markdown --redact --out reports/doctor-before.md
pnpm exec repo upgrade --no-overwrite
pnpm exec repo doctor --markdown --redact --out reports/doctor-after.md
```

Continue with [Adopt an existing workspace](/tasks/adopt-existing).

## I Want To Create A Package Or App

```bash
pnpm exec repo templates
pnpm exec repo new sdk --template tsdown
pnpm exec repo new docs --template nimbus --dry-run
```

For daily development, root scripts also work:

```bash
pnpm run repo:new -- sdk --template tsdown
```

Keep reading: [Templates](/reference/templates).

## I Want To Check Before Committing

```bash
pnpm run repo:check
pnpm exec repo check --dry-run
pnpm exec repo check --full
```

Save the plan when automation needs it:

```bash
pnpm exec repo check --json --out reports/check-plan.json
pnpm exec repo check --markdown --redact --out reports/check-plan.md
```

Continue with [Add checks to CI](/tasks/ci).

## I Want To Debug CI Or Another Machine

```bash
pnpm exec repo doctor --markdown --redact --out reports/doctor.md
pnpm exec repo env support --markdown --redact --out reports/support.md
pnpm exec repo env snapshot --json --out reports/snapshot.json
```

Continue with [Troubleshoot](/tasks/troubleshooting).

## I Want To Sync Standard Assets

```bash
pnpm exec repo upgrade --no-overwrite
pnpm exec repo upgrade --yes
pnpm exec repo upgrade --core
```

| Goal                                       | Command                       |
| ------------------------------------------ | ----------------------------- |
| First adoption pass, preserve local config | `repo upgrade --no-overwrite` |
| Explicitly overwrite managed assets        | `repo upgrade --yes`          |
| Sync only core config                      | `repo upgrade --core`         |

## I Want To Inspect Workspace Structure

```bash
pnpm exec repo ws ls
pnpm exec repo ws ls --json --out reports/workspaces.json
pnpm exec repo ws ls --markdown --redact --out reports/workspaces.md
```

## I Want To Inspect Config

```bash
pnpm exec repo config inspect
pnpm exec repo cfg i --json --out reports/config.json
```

Keep reading: [Configuration](/reference/config).

## I Want Shorter Commands

```bash
repo tpl
repo ws ls
repo e support --markdown --redact
repo cfg i
```

Keep reading: [Command Aliases](/reference/aliases).
