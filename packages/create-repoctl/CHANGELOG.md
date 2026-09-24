# create-repoctl

## 1.0.3

### Patch Changes

- Keep generated repoctl workspaces aligned with the source workspace package manager and guide agents to use the latest repoctl create entrypoint.

  Refresh stale local metadata, preserve the complete pnpm version declaration, and enforce it through Corepack and the workspace package-manager policy. Ship the strict npmrc asset under a publishable filename and restore it during creation and upgrades.

- Updated dependencies:
  - @icebreakers/monorepo-templates@2.0.3

## 1.0.2

### Patch Changes

- Update repository links for the move to the icelib GitHub organization and migrate the release workflow to npm trusted publishing. Package names and public APIs are unchanged.

- Updated dependencies:
  - @icebreakers/monorepo-templates@2.0.2

## 1.0.1

### Patch Changes

- Updated dependencies:
  - @icebreakers/monorepo-templates@2.0.1

## 1.0.0

### Major Changes

- Require Node.js 22.13 or newer. These packages no longer advertise Node 18 support.

### Minor Changes

- Give agents a non-interactive create path, a user-facing AGENTS.md, and a repoctl skill that can scaffold a workspace from an empty directory.

### Patch Changes

- Updated dependencies:
  - @icebreakers/monorepo-templates@2.0.0

## 0.1.7

### Patch Changes

- Updated dependencies:
  - @icebreakers/monorepo-templates@1.3.5

## 0.1.6

### Patch Changes

- Updated dependencies:
  - @icebreakers/monorepo-templates@1.3.4

## 0.1.5

### Patch Changes

- Updated dependencies:
  - @icebreakers/monorepo-templates@1.3.3

## 0.1.4

### Patch Changes

- 统一所有公开包的 repoctl 仓库、文档、问题反馈和 npm 首页元数据，移除旧的 dev-configs 标识，并同步双语 README 的项目链接。

- Updated dependencies:
  - @icebreakers/monorepo-templates@1.3.2

## 0.1.3

### Patch Changes

- Updated dependencies:
  - @icebreakers/monorepo-templates@1.3.1

## 0.1.2

### Patch Changes

- Update package homepage metadata and documentation links to the repoctl domain.

- Updated dependencies:
  - @icebreakers/monorepo-templates@1.3.0

## 0.1.1

### Patch Changes

- Updated dependencies:
  - @icebreakers/monorepo-templates@1.2.1

## 0.1.0

### Minor Changes

- Reposition repoctl as the task-first CLI for pnpm and Turborepo monorepos, add English-default and Simplified Chinese CLI/documentation support, make create-repoctl the canonical workspace creator, and keep compatibility entrypoints working.

### Patch Changes

- Updated dependencies:
  - @icebreakers/monorepo-templates@1.2.0

## 0.0.14

### Patch Changes

- Updated dependencies:
  - create-icebreaker@1.1.0

## 0.0.13

### Patch Changes

- 📦 **Dependencies**
  → `create-icebreaker@1.0.15`

## 0.0.12

### Patch Changes

- 📦 **Dependencies**
  → `create-icebreaker@1.0.14`

## 0.0.11

### Patch Changes

- 📦 **Dependencies**
  → `create-icebreaker@1.0.13`

## 0.0.10

### Patch Changes

- 📦 **Dependencies**
  → `create-icebreaker@1.0.12`

## 0.0.9

### Patch Changes

- 📦 **Dependencies**
  → `create-icebreaker@1.0.11`

## 0.0.8

### Patch Changes

- 📦 **Dependencies**
  → `create-icebreaker@1.0.10`

## 0.0.7

### Patch Changes

- 📦 **Dependencies**
  → `create-icebreaker@1.0.9`

## 0.0.6

### Patch Changes

- 🐛 **Keep repoctl in generated root package.json files created by the repoctl scaffold entry.** [`e126da6`](https://github.com/sonofmagic/monorepo-template/commit/e126da6a93ac0f79bfcfa70811588ad6e89cebc1) by @sonofmagic
- 📦 **Dependencies** [`e126da6`](https://github.com/sonofmagic/monorepo-template/commit/e126da6a93ac0f79bfcfa70811588ad6e89cebc1)
  → `create-icebreaker@1.0.8`

## 0.0.5

### Patch Changes

- 📦 **Dependencies**
  → `create-icebreaker@1.0.7`

## 0.0.4

### Patch Changes

- 📦 **Dependencies**
  → `create-icebreaker@1.0.6`

## 0.0.3

### Patch Changes

- 📦 **Dependencies**
  → `create-icebreaker@1.0.5`

## 0.0.2

### Patch Changes

- 📦 **Dependencies**
  → `create-icebreaker@1.0.4`

## 0.0.1

### Patch Changes

- 🐛 **新增 `create-repoctl` 包，提供 `npm create repoctl`、`pnpm create repoctl`、`yarn create repoctl` 的 repoctl 品牌脚手架入口，并补齐 `create-icebreaker` 的包导出以便复用现有创建流程。** [`5623491`](https://github.com/sonofmagic/monorepo-template/commit/5623491f0229982856a4ee6aa92631384be207ab) by @sonofmagic

- 🐛 **Generate clean repoctl scaffold output by rewriting root TypeScript project references from the selected templates and avoiding source-repo-only tooling loaders in created projects.** [`ae546e4`](https://github.com/sonofmagic/monorepo-template/commit/ae546e4cf3bb899f091ca48a95a7bb2a8181a2bb) by @sonofmagic
- 📦 **Dependencies** [`5623491`](https://github.com/sonofmagic/monorepo-template/commit/5623491f0229982856a4ee6aa92631384be207ab)
  → `create-icebreaker@1.0.3`

## 0.0.0

### Patch Changes

- 初始发布 `create-repoctl`，提供 `npm create repoctl` / `pnpm create repoctl` / `yarn create repoctl` 的 repoctl 脚手架入口。
