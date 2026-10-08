---
"@icebreakers/monorepo": patch
"repoctl": patch
---

Reduce CLI and isolated test startup costs by discovering workspace manifests without loading pnpm installation internals, and loading ESLint plugins and Vitest configuration merging only when requested. Workspace inspection includes packages for other platforms and retains pnpm manifest formats, exclusion patterns, sorting and symlink identities.
