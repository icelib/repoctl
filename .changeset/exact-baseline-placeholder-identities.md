---
"@icebreakers/monorepo": patch
---

Preserve exact filesystem identities when cleaning Knip baselines and failed TypeScript reference registry writes, so large Windows file IDs cannot identify another writer's replacement as owned output.
