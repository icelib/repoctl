---
'@icebreakers/monorepo-templates': patch
'@icebreakers/monorepo': patch
create-repoctl: patch
create-icebreaker: patch
---

Keep generated repoctl workspaces aligned with the source workspace package manager and guide agents to use the latest repoctl create entrypoint.

Refresh stale local metadata, preserve the complete pnpm version declaration, and enforce it through Corepack and the workspace package-manager policy. Ship the strict npmrc asset under a publishable filename and restore it during creation and upgrades.
