---
"@icebreakers/monorepo": minor
"@icebreakers/monorepo-templates": minor
"repoctl": minor
"create-repoctl": minor
"create-icebreaker": minor
---

Add upgrade change previews with bounded content diffs, transactional release migration that respects selected files, durable journals, and cross-process locking; harden generated workspace scripts, partial package creation recovery with durable manifest rollback and snapshot retention, release workflow classification, pre-push verification, workspace cache isolation, and doctor diagnostics for custom workspace layouts and interrupted upgrades with consumer regressions.

Fix workspace root filtering through directory aliases and keep discovered workspace and package paths consistent, including projects without a workspace manifest.

Normalize explicit pre-push workspace aliases within the caller's directory boundary, and resolve create/init repository metadata against the physical Git root while keeping README links relative to their actual directory.

Encode generated README package links so paths containing spaces, parentheses, URL delimiters, or literal percent signs resolve correctly.

Escape Markdown punctuation in generated README package link labels so package names display exactly as declared.

Validate workspace manifests before init writes and add missing default patterns to explicit arrays or missing or blank manifests. Package creation initializes missing or blank manifests, including comment-only documents, with only the exact target path. Preserve pnpm's implicit discovery for valid `null`, `{}`, and mappings without `packages`, retaining unchanged text when no additions are needed. Support alias keys and values for `packages`, preserve comments and other field values and types, and expand references when needed to keep shared values unchanged. Reread serialized additions using pnpm's rules and compare the complete planned manifest before writing.

Align initialization, package creation, and doctor with pnpm's current YAML core interpretation, including manifests declaring YAML 1.1. Support ordinary anchors, aliases, and comments while rejecting explicit non-core tags before writes and reporting stable workspace-manifest failures, preventing incorrect package discovery and invalid manifest updates.

Validate catalog and named catalog structures with pnpm before initialization or creation writes, rejecting malformed mappings, non-string entries, and null named catalogs with stable doctor workspace-manifest failures. Preserve pnpm-valid top-level null catalog fields, empty mappings, ordinary aliases, and empty string specifiers.

Apply pnpm manifest and catalog validation to upgrade planning and release migration, preserving existing implicit workspace discovery and metadata values and types even in manifests declaring YAML 1.1. Keep legacy release configuration and prerelease state on invalid manifests, declined overwrites, or retained custom workflows. Retain unchanged manifest text and verify formatted changes against their planned values and types.

Verify each pushed commit in a temporary clone with committed workspace discovery, frozen dependency installation, ref deduplication, and cleanup on failures or interruption, preserving the original checkout and index.
