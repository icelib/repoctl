---
"@icebreakers/monorepo": patch
"repoctl": patch
"@icebreakers/monorepo-templates": patch
---

Preserve snapshot planning's configuration independence through the CLI: do not load or execute repoctl configuration for release snapshot, while ordinary release commands retain strict preflight validation.
