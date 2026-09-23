# @icebreakers/changelog-github

## 2.1.1

### Patch Changes

- chore(deps): update dependency dotenv to v18 (#901)

- Update repository links for the move to the icelib GitHub organization and migrate the release workflow to npm trusted publishing. Package names and public APIs are unchanged.

## 2.1.0

### Minor Changes

- Require Node.js 22.13 or newer and normalize package metadata.

## 2.0.4

### Patch Changes

- chore(deps): update all non-major dependencies (#872)

## 2.0.3

### Patch Changes

- 统一所有公开包的 repoctl 仓库、文档、问题反馈和 npm 首页元数据，移除旧的 dev-configs 标识，并同步双语 README 的项目链接。

- Move the shared development configuration packages into the repoctl workspace while preserving their package names and public exports.

## 2.0.2

### Patch Changes

- 迁移到基于 pnpm 原生版本意图和 repoctl 的统一发版流程，并同步升级已验证兼容的工程依赖。

## 2.0.1

### Patch Changes

- 🐛 **升级除 TypeScript 外的运行时与开发依赖，并适配 Changesets 3 的 GitHub 信息接口，保持变更日志中的提交、拉取请求和作者链接输出不变。** [#282](https://github.com/sonofmagic/dev-configs/pull/282) by @sonofmagic

## 2.0.0

### Major Changes

- 🚀 **最低运行环境升级为 Node 22.12.0，发布校验不再覆盖 Node 20。** [`a759944`](https://github.com/sonofmagic/dev-configs/commit/a759944d539f3b6871430b6e951962965e03b493)

### Patch Changes

- 🐛 **修复 GitHub 元数据请求偶发失败时中断 changeset version 的问题，失败时会保留基础提交链接并继续生成 changelog。** [`19cee04`](https://github.com/sonofmagic/dev-configs/commit/19cee04f5d0c89a268d00842cc37edadee790f56)

## 1.0.2

### Patch Changes

- 🐛 **Refresh package dependencies across the linting toolchain and update the** [`9a44d9b`](https://github.com/sonofmagic/dev-configs/commit/9a44d9bdb0cd42ce67376446eb0dfd2a095d2698) by @sonofmagic
  - ESLint integration test to remain compatible with the latest Stylelint
  - diagnostic wording.

## 1.0.1

### Patch Changes

- 🐛 **deps: upgrade** [`70dc018`](https://github.com/sonofmagic/dev-configs/commit/70dc01865748ba0aa9ec558e0ea11821e7f2f6cd) by @sonofmagic

## 1.0.0

### Major Changes

- 🚀 **Raise the minimum supported Node.js versions to `^20.19.0 || >=22.12.0`** [`92b869f`](https://github.com/sonofmagic/dev-configs/commit/92b869fb95ad99a1c7f5f970c675cfa79b8b9a31) by @sonofmagic
  - across all published packages so the supported runtime range matches the
  - default `require(esm)` behavior.
  - Also fix `@icebreakers/eslint-config` so ESLint config loading works on
  - Node.js `20.19.0` by polyfilling `Object.groupBy` when the runtime does not
  - provide it yet. This unblocks `pnpm lint` and test execution for the Node 20
  - CI job.

## 0.2.2

### Patch Changes

- 🐛 **Migrate all packages under `packages/` to build with `tsdown`.** [`45c73ca`](https://github.com/sonofmagic/dev-configs/commit/45c73ca9f70ba813052c9970b54e08d853e638ce) by @sonofmagic
  - This removes the remaining `tsup` and `unbuild` package-level build configs,
  - switches package scripts to `tsdown`, and keeps the package outputs aligned with
  - the existing published entry points.

## 0.2.1

### Patch Changes

- 🐛 **bump package dependencies for changelog, commitlint, eslint, and stylelint configs.** [`0554cd5`](https://github.com/sonofmagic/dev-configs/commit/0554cd5b3dc3c02e965d579083e7df3f15399332) by @sonofmagic

## 0.2.0

### Minor Changes

- ✨ **parse conventional commit headlines and detect breaking changes** [`e0b7039`](https://github.com/sonofmagic/dev-configs/commit/e0b7039253361fafd71db453d77dfb7f2748e2c1) by @sonofmagic
  - Strip `type(scope):` prefix from headlines, render scope as bold label (e.g. `chore(deps): upgrade` → `**deps:** upgrade`)
  - Detect breaking changes via `!` suffix or `BREAKING CHANGE:` in body, show 💥 icon with ⚠️ prefix

- ✨ **show full dependency list in collapsible details block when more than 3 packages are updated** [`54b92e2`](https://github.com/sonofmagic/dev-configs/commit/54b92e2c8bed80f27124ba0fec4a50872a5fc96b) by @sonofmagic

### Patch Changes

- 🐛 **deduplicate dependency commit references and preserve intentional line breaks in detail blocks** [`b0d23ea`](https://github.com/sonofmagic/dev-configs/commit/b0d23ea181952d217f7c966edd7f07ac568017a3) by @sonofmagic

- 🐛 **replace deprecated trimRight with trimEnd and fix nested bold markup when scope is present** [`3d73a16`](https://github.com/sonofmagic/dev-configs/commit/3d73a161bf889fe643b3967ecc07580bd666f60b) by @sonofmagic

## 0.1.1

### Patch Changes

- 🐛 **chore(deps): upgrade** [`c3c641e`](https://github.com/sonofmagic/dev-configs/commit/c3c641e119faf2e0d0ffa64cd8610cf17eed9952) by @sonofmagic

## 0.1.0

### Minor Changes

- ✨ **Improve GitHub release note readability for Changesets** [#5](https://github.com/sonofmagic/dev-configs/pull/5) by @github-actions
  - Support summary directives: `pr:` / `pull request:`, `commit:`, `author:` / `user:` (case-insensitive)
  - Prefer PR links over commit links; fall back to short SHA when no PR exists
  - Render details as an indented list and keep inline Markdown (`code`, [links](https://example.com), #123, `packages/changelog-github/src/index.ts`)
  - Auto-load `.env` via `dotenv/config` so local CLI runs behave like CI
  - Drop redundant separators + release-type labels so entries stay scannable
  - Format dependency bumps as `📦 Dependencies` (≤3) or `📦 Updated N dependencies` (>3)

## 0.0.2

### Patch Changes

- 🐛 **chore(deps): upgrade** — [`a24c546`](https://github.com/sonofmagic/dev-configs/commit/a24c546f6e01352b09fb5b219b7b867b22a96da3) · Thanks [@sonofmagic](https://github.com/sonofmagic) · Patch release

## 0.0.1

### Patch Changes

- 🐛 **docs: reflow package READMEs for better rendering** — [`44d4b37`](https://github.com/sonofmagic/dev-configs/commit/44d4b37a47e0a0c327fedce97d3d04ce36425a87) · Thanks [@sonofmagic](https://github.com/sonofmagic) · Patch release
