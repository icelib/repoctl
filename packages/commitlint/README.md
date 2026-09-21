# @icebreakers/commitlint-config

- [简体中文指南](./README.zh.md)

## Overview

`@icebreakers/commitlint-config` wraps `@commitlint/config-conventional`, exposes a typed factory API, and keeps commit prompts in sync with any custom types you add. Use it to enforce Conventional Commits across monorepos while tailoring type, scope, and subject rules per team.

## Installation

```bash
pnpm add -D @commitlint/cli @icebreakers/commitlint-config
```

## Quick Start

Create `commitlint.config.ts` in the repository root:

```ts
import { icebreaker } from '@icebreakers/commitlint-config'

export default icebreaker()
```

Add a script or Husky hook to run commitlint:

```bash
pnpm commitlint --from=HEAD~1
```

When you need explicit naming, use `createIcebreakerCommitlintConfig(options)`—it returns the same value as `icebreaker`.

## Customising Rules

The factory accepts targeted option groups so you can extend the default convention without re-implementing every rule:

```ts
import {
  icebreaker,
  RuleConfigSeverity,
} from '@icebreakers/commitlint-config'

export default icebreaker({
  types: {
    definitions: [
      { value: 'docs', title: 'Docs', description: '文档更新', emoji: '📝' },
      { value: 'deps', title: 'Dependencies', description: 'Bump deps' },
    ],
    add: ['perf'],
  },
  scopes: {
    values: ['core', 'lint', 'website'],
    required: true,
    case: ['kebab-case', 'lower-case'],
  },
  subject: {
    forbidden: ['sentence-case', 'start-case'],
    caseSeverity: RuleConfigSeverity.Warning,
    fullStop: false,
  },
  header: {
    maxLength: 100,
  },
  extends: ['@acme/commitlint-config'],
})
```

- `types` – add new entries, merge prompt metadata, or tighten the `type-enum` rule.
- `scopes` – whitelist scope values, enforce casing, or require scopes.
- `subject` – forbid casing styles, configure punctuation, and allow empty subjects for merge commits when needed.
- `header` – override maximum length or severity.
- `extends` / `rules` – append extra commitlint configs or raw rule overrides.
- `prompt` – merge additional prompt groups for interactive commit tools.

All rule severities use `RuleConfigSeverity` from `@commitlint/types`.

## Prompt Synchronisation

The factory keeps commit prompts in sync with any custom type definitions. If you pass a `prompt` block, it deep merges with the conventional preset, so your CLI prompt automatically reflects newly added types or scopes.

## Suggested Workflow

1. Install Husky and configure a `commit-msg` hook:
   ```bash
   pnpm husky add .husky/commit-msg "pnpm commitlint --edit \"$1\""
   ```
2. Use `pnpm commit` (Changeset prompt) or your own CLI for guided commits.
3. Add `pnpm lint` and `pnpm test` to CI so commits fail fast when rules change.

## Troubleshooting

- If commitlint cannot find the config file, ensure it is named `commitlint.config.ts` (or `.cjs`) at the repository root.
- For workspaces that ship custom prompts, pass a `prompt` object instead of re-building the schema by hand.
- To disable commits in scripts (e.g. release bots), set `COMMITLINT_DISABLED=true` and skip the hook execution.

## Project links

- Documentation: https://repoctl.icebreaker.top
- Repository: https://github.com/icelib/repoctl/tree/main/packages/commitlint
- Issues: https://github.com/icelib/repoctl/issues
