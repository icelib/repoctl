---
"@icebreakers/monorepo": patch
"repoctl": patch
"@icebreakers/monorepo-templates": patch
---

Validate doctor configuration through the shared runtime schema and explain workspace-root policy consistently from package directories. Preserve omitted rule selection as all rules and explicit empty selection as none, while validating the full configuration before executing selected doctor checks.
