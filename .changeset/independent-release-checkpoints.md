---
"@icebreakers/monorepo": patch
"repoctl": patch
---

fix(release): Initialize release checkpoint storage with an independent root commit containing only checkpoint documentation, avoiding source workflows and an unnecessary workflow permission requirement. Preserve the original branch creation error when reconciliation fails while retaining concurrent initialization and checkpoint recovery.
