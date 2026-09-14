# Start here

Use this section when repoctl is new to you. The shortest useful path is to install the CLI, run `repo init`, then run `repo doctor`.

## Pick your first move

- [Install and initialize](./install.md) if this is your first repoctl command.
- [What is repoctl?](./what-is-repoctl.md) for the product overview.
- [Install repoctl](./install-repoctl.md) for the shortest setup path.
- [Run the first diagnosis](./diagnose.md) if repoctl is already installed.
- [Choose the next task](./choose-next.md) after you have a diagnosis.

## What repoctl does

repoctl keeps common monorepo work in a small, predictable command set:

| Need                            | Command                |
| ------------------------------- | ---------------------- |
| Add repository conventions      | `repo init`            |
| Inspect repository health       | `repo doctor`          |
| Create a package or app         | `repo new`             |
| Plan checks before running them | `repo check --dry-run` |

The CLI works with pnpm workspaces and understands Turborepo task graphs. It does not replace either tool.

## Before you continue

You need Node.js 22.13 or newer and pnpm available on your path. Run commands from the repository root so repoctl can read the workspace configuration.
