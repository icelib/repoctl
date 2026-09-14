---
title: Install repoctl
description: Install repoctl in a pnpm monorepo, initialize managed defaults, and run your first repository diagnosis.
---

# Install repoctl

Install repoctl as a development dependency so every teammate and CI job uses the same version.

```bash
pnpm add -D repoctl
pnpm exec repo init
pnpm exec repo doctor
```

Continue with [checks](/tasks/checks) or [adopting an existing workspace](/tasks/adopt-existing).
