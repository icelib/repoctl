---
"@icebreakers/monorepo": minor
"repoctl": minor
"@icebreakers/monorepo-templates": patch
---

Validate repoctl-owned configuration before command side effects, explain shared defaults and overrides, and redact sensitive report values. Correct the generated lint-staged repoCommand field.

Validate public API report settings and keep configuration loading free of filesystem cache writes during read-only commands.
