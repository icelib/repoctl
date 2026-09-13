# @icebreakers/monorepo

## 5.5.1

### Patch Changes

- Retry transient release API failures and reconcile partially published releases

## 5.5.0

### Minor Changes

- Require Node.js 22.13 or newer and normalize package metadata.

- Give agents a non-interactive create path, a user-facing AGENTS.md, and a repoctl skill that can scaffold a workspace from an empty directory.

### Patch Changes

- Use a pnpm catalog for duplicated package versions without copying catalog specifiers into generated workspaces.

- Bump lint-staged, UnoCSS, Vite 8.3, wrangler, and packaged template dependencies.

- Updated dependencies:
  - @icebreakers/commitlint-config@4.1.0
  - @icebreakers/eslint-config@8.0.0
  - @icebreakers/monorepo-templates@2.0.0
  - @icebreakers/stylelint-config@5.1.0

## 5.4.9

### Patch Changes

- Updated dependencies:
  - @icebreakers/monorepo-templates@1.3.5

## 5.4.8

### Patch Changes

- chore(deps): update all non-major dependencies (#874)

- Updated dependencies:
  - @icebreakers/eslint-config@7.1.3
  - @icebreakers/monorepo-templates@1.3.4
  - @icebreakers/stylelint-config@5.0.9

## 5.4.7

### Patch Changes

- Updated dependencies:
  - @icebreakers/eslint-config@7.1.2
  - @icebreakers/monorepo-templates@1.3.3
  - @icebreakers/stylelint-config@5.0.8

## 5.4.6

### Patch Changes

- 统一所有公开包的 repoctl 仓库、文档、问题反馈和 npm 首页元数据，移除旧的 dev-configs 标识，并同步双语 README 的项目链接。

- Updated dependencies:
  - @icebreakers/commitlint-config@4.0.6
  - @icebreakers/eslint-config@7.1.1
  - @icebreakers/monorepo-templates@1.3.2
  - @icebreakers/stylelint-config@5.0.7

## 5.4.5

### Patch Changes

- Fix repoctl GitHub Release notes so contributors are preserved from the Release PR, scoped to published packages, and deduplicated across Markdown formats.

## 5.4.4

### Patch Changes

- 发布 npm provenance 时遇到瞬时签名服务错误会自动按未发布包重试，并在包已上传但客户端未收到响应时继续完成发布流程。

## 5.4.3

### Patch Changes

- Resolve the bundled TypeScript baseline through package exports so repoctl tooling works after installation.

## 5.4.2

### Patch Changes

- Updated dependencies:
  - @icebreakers/monorepo-templates@1.3.1

## 5.4.1

### Patch Changes

- Update package homepage metadata to the repoctl documentation domain.

- 统一 Release workflow 的触发检测，并在质量门禁前校验 workspace 依赖协议。

- Updated dependencies:
  - @icebreakers/monorepo-templates@1.3.0

## 5.4.0

## 5.3.0

### Minor Changes

- 新增可配置的发布生命周期脚本、中文 Release 元数据、未消费 change intent 保护，以及 stable、prerelease 和恢复发布的一致编排。

### Patch Changes

- Updated dependencies:
  - @icebreakers/monorepo-templates@1.2.1

## 5.2.0

### Minor Changes

- Reposition repoctl as the task-first CLI for pnpm and Turborepo monorepos, add English-default and Simplified Chinese CLI/documentation support, make create-repoctl the canonical workspace creator, and keep compatibility entrypoints working.

### Patch Changes

- Updated dependencies:
  - @icebreakers/monorepo-templates@1.2.0

## 5.1.1

### Patch Changes

- 在 Release CI 结束时汇总输出成功发布的包名与版本，便于直接确认本次发布结果。

- 规范化历史 Changesets changelog 的 Release Note，修复依赖条目、提交/Issue 链接和自动化贡献者的错误归类，并提供可幂等重建 GitHub Release 正文的命令。

## 5.1.0

### Minor Changes

- 迁移到 pnpm 原生 versioning，使用 `pnpm change`、`pnpm version -r`、`pnpm publish -r` 和 lanes 管理版本、变更日志与预发布流程。

- 将 GitHub Release 编排下沉到 repoctl，新增统一的 `repo release ci` 入口，并支持旧模板 release workflow 与 Changesets prerelease 状态的一键迁移。

### Patch Changes

- 迁移到 pnpm 原生发布流程后，自动关闭旧 Changesets Release PR，避免同一批版本变更生成重复的 Release PR。

- 统一生成按语义分类的人类可读 Release PR 和 GitHub Release 正文，并补充 package、提交、Pull Request、Issue、贡献者与版本对比链接。

- 修复 Version Packages PR 合并后正式发布被错误跳过的问题，确保已更新版本但尚未发布到 npm 的包会继续执行发布。

- 修复 release CI 未向 repoctl 注入 GitHub Actions 原生的 `github.token`，导致 Release PR、tag 和 GitHub Release 编排无法调用 GitHub API。

- 在 Release PR 中展示变更来源的可点击 commit、Pull Request 和 Issue 链接。

- 避免在尚未发布的 Release PR 中把目标版本链接到 npm，仅为已存在的旧版本和已发布的 GitHub Release 版本提供 npm 链接。

- 在 Release Note 中显示包的升级前后版本，并为已发布版本补充 npm 链接。

- 修复 repoctl 创建的 Release PR 只有固定说明、缺少实际包版本与 changelog 变更内容的问题。

- 优化 Release PR 正文为发布包汇总表和分包变更详情，并移除面向实现的固定说明。

- 修复 release CI 在注入 GitHub Actions token 后，单元测试继承运行时环境导致发布流程误报失败的问题。

- Updated dependencies:
  - @icebreakers/monorepo-templates@1.1.0

## 5.0.3

### Patch Changes

- 🐛 **Handle Changesets v3 empty-version runs in repo release commands and update generated release workflows to changesets/action v2.** [`b580b94`](https://github.com/sonofmagic/monorepo-template/commit/b580b94619f8cffc3c482bf17e1f0cdca96106c7) by @sonofmagic
- 📦 **Dependencies** [`376b346`](https://github.com/sonofmagic/monorepo-template/commit/376b346748a23d2ad2738cc5a45772933d4aac74)
  → `@icebreakers/monorepo-templates@1.0.15`

## 5.0.2

### Patch Changes

- 📦 **Dependencies** [`0f2322d`](https://github.com/sonofmagic/monorepo-template/commit/0f2322d8f10e4264697e53ab6b357aab2f8ea452)
  → `@icebreakers/monorepo-templates@1.0.14`

## 5.0.1

### Patch Changes

- 📦 **Dependencies** [`38f1652`](https://github.com/sonofmagic/monorepo-template/commit/38f1652729cd17c8b86f06b2b30922f25f93ef32)
  → `@icebreakers/monorepo-templates@1.0.13`

## 5.0.0

### Major Changes

- 🚀 **最低运行环境升级为 Node 22.12.0，并使用已修复 GitHub 元数据容错逻辑的 changelog 工具链。** [`89922fe`](https://github.com/sonofmagic/monorepo-template/commit/89922fe9bfd0b9528288f96df2648784a1e14a9d) by @sonofmagic

### Patch Changes

- 📦 **Dependencies** [`16b22ad`](https://github.com/sonofmagic/monorepo-template/commit/16b22adce6df418aef2af7827cf903fa9a00b2f4)
  → `@icebreakers/monorepo-templates@1.0.12`

## 4.0.13

### Patch Changes

- 📦 **Dependencies** [`a73b944`](https://github.com/sonofmagic/monorepo-template/commit/a73b94456d588b79c026846659e25f3b90c3d9dd)
  → `@icebreakers/monorepo-templates@1.0.11`

## 4.0.12

### Patch Changes

- 📦 **Dependencies** [`dd6f262`](https://github.com/sonofmagic/monorepo-template/commit/dd6f2628e70ee5af5e6d8caa4631b6a47d515a54)
  → `@icebreakers/monorepo-templates@1.0.10`

## 4.0.11

### Patch Changes

- 🐛 **deps: upgrade** [`d115c08`](https://github.com/sonofmagic/monorepo-template/commit/d115c08963412e9ee638e9d56e0f9feca75baf9d) by @sonofmagic

## 4.0.10

### Patch Changes

- 🐛 **deps: upgrade** [`8462aa3`](https://github.com/sonofmagic/monorepo-template/commit/8462aa310b63a06fc3242c406f9da969c1cd3650) by @sonofmagic
- 📦 **Dependencies** [`8462aa3`](https://github.com/sonofmagic/monorepo-template/commit/8462aa310b63a06fc3242c406f9da969c1cd3650)
  → `@icebreakers/monorepo-templates@1.0.9`

## 4.0.9

### Patch Changes

- 📦 **Dependencies** [`171cafa`](https://github.com/sonofmagic/monorepo-template/commit/171cafa4d5943754138cd7ff49434214a33b7919)
  → `@icebreakers/monorepo-templates@1.0.8`

## 4.0.8

### Patch Changes

- 🐛 **Remove stale TypeScript `ignoreDeprecations` suppressions from published and generated tsconfig files.** [`77b6c50`](https://github.com/sonofmagic/monorepo-template/commit/77b6c500775a589edd952614cedda4f303a92847) by @sonofmagic
- 📦 **Dependencies** [`77b6c50`](https://github.com/sonofmagic/monorepo-template/commit/77b6c500775a589edd952614cedda4f303a92847)
  → `@icebreakers/monorepo-templates@1.0.7`

## 4.0.7

### Patch Changes

- 📦 **Dependencies** [`1e153cf`](https://github.com/sonofmagic/monorepo-template/commit/1e153cf048afac70c43e4586dd3fa345e53b4589)
  → `@icebreakers/monorepo-templates@1.0.6`

## 4.0.6

### Patch Changes

- 🐛 **Upgrade the bundled Icebreakers ESLint and Stylelint presets so repoctl/tooling uses the upstream peer dependency ownership fixes instead of carrying lint ecosystem dependencies in the monorepo runtime package.** [`540c09e`](https://github.com/sonofmagic/monorepo-template/commit/540c09ee1d3cc825f638d8bf8d3d8aaa21ee8a07) by @sonofmagic
- 📦 **Dependencies** [`8f026a8`](https://github.com/sonofmagic/monorepo-template/commit/8f026a856a68e75732655a55d0a8107d5c9fae3f)
  → `@icebreakers/monorepo-templates@1.0.5`

## 4.0.5

### Patch Changes

- 📦 **Dependencies** [`7382054`](https://github.com/sonofmagic/monorepo-template/commit/738205498217006b548ee03a8d03ecc356371cb8)
  → `@icebreakers/monorepo-templates@1.0.4`

## 4.0.4

### Patch Changes

- 🐛 **Update package homepage metadata and documentation links to repo.icebreaker.top.** [`cb6fd63`](https://github.com/sonofmagic/monorepo-template/commit/cb6fd63cfc18df526d2c42072711dba500096d57) by @sonofmagic

## 4.0.3

### Patch Changes

- 🐛 **repoctl now ships a publishable `tsconfig.json` entry for direct `extends` usage, and generated templates write that same public entry instead of relying on a local base file.** [`67a2ed5`](https://github.com/sonofmagic/monorepo-template/commit/67a2ed50cc2782fa7fc45a6ce2811a389e84173d) by @sonofmagic

- 🐛 **Internalize stable and prerelease Changesets publishing in `repo release` commands so generated repositories no longer need copied release scripts.** [`3f67b4c`](https://github.com/sonofmagic/monorepo-template/commit/3f67b4ca9a486cbd8590fa558238044f5e282ccf) by @sonofmagic

- 🐛 **release 流程改为按分支分流：`main` 只发正式包，`alpha`、`beta`、`rc`、`next` 仅以 Changesets pre 模式发布对应 tag 包，并补齐了相关文档说明。** [`758a57f`](https://github.com/sonofmagic/monorepo-template/commit/758a57f788aceb66cf77afc17ea379f4e0003af9) by @sonofmagic
- 📦 **Dependencies** [`67a2ed5`](https://github.com/sonofmagic/monorepo-template/commit/67a2ed50cc2782fa7fc45a6ce2811a389e84173d)
  → `@icebreakers/monorepo-templates@1.0.3`

## 4.0.2

### Patch Changes

- 🐛 **Stabilize workspace package discovery and config inspection on Windows short paths.** [#664](https://github.com/sonofmagic/monorepo-template/pull/664) by @renovate
- 📦 **Dependencies** [`f24eb48`](https://github.com/sonofmagic/monorepo-template/commit/f24eb48a8457d1d491af5756bd442b1027aa37a1)
  → `@icebreakers/monorepo-templates@1.0.2`

## 4.0.1

### Patch Changes

- 📦 **Dependencies** [`a209464`](https://github.com/sonofmagic/monorepo-template/commit/a209464efbbe64a5cc507d0fbf3110ce5e91dde1)
  → `@icebreakers/monorepo-templates@1.0.1`

## 4.0.0

### Major Changes

- 🚀 **Remove the legacy `tsup` and `unbuild` library templates from the repository and scaffolding flow.** [`5a0dae9`](https://github.com/sonofmagic/monorepo-template/commit/5a0dae99cc3c0eef74f88c1c0da01c5f58552042) by @sonofmagic

  - `monorepo new`, `repoctl new`, and `create-icebreaker` no longer offer `tsup` or `unbuild` as built-in template keys. The bundled template asset set and related docs have been updated to standardize on `tsdown` as the only generic TypeScript library template.

- 🚀 **Refactor tooling config helpers to use object-style `define*Config` signatures only, and remove the legacy `defineMonorepo*Config` aliases.** [`a7fffa1`](https://github.com/sonofmagic/monorepo-template/commit/a7fffa149f5a6a4166226aa5fed284a906d29490) by @sonofmagic
  - Add bundled `@icebreakers/monorepo/tsconfig` exports so repository and consumer `tsconfig.json` files can extend the package by name instead of using relative paths.

### Minor Changes

- ✨ **Add task-first `repoctl` entrypoints such as `init`, `new`, `check`, and `upgrade`, plus compatibility top-level commands for `sync`, `clean`, and `mirror`.** [`72ebd27`](https://github.com/sonofmagic/monorepo-template/commit/72ebd27b7498ee6f9176d984612a0496a201d140) by @sonofmagic

  - Refresh the guided package creation flow to start from user intent, add `init --preset` support, and align package docs, template docs, and create-icebreaker guidance around the new lower-cost onboarding path.

- ✨ **Add the new `repoctl` package as the preferred repo toolchain entrypoint while keeping `@icebreakers/monorepo` published and version-linked for compatibility. Template assets, docs, hooks, and config defaults now prefer `repoctl`, and cleanup/upgrade flows preserve whichever helper package a workspace already uses.** [`eb56ff6`](https://github.com/sonofmagic/monorepo-template/commit/eb56ff644072f18475914c8f2860747d1f96046b) by @sonofmagic

- ✨ **Remove the legacy `sync` CLI command and its related config support from the monorepo toolchain.** [`e7e26eb`](https://github.com/sonofmagic/monorepo-template/commit/e7e26eb0e962ecb9ddbf6a1f69a36e28dedf9302) by @sonofmagic

- ✨ **Improve template discovery and scaffolding developer experience with template listing/check commands, create dry-run previews, structured doctor output, and beginner documentation.** [`c237abc`](https://github.com/sonofmagic/monorepo-template/commit/c237abc0bfc3fd16e70efd1fea5f4c82fac8a3eb) by @sonofmagic

### Patch Changes

- 🐛 **Allow `defineMonorepoVitestConfig()` to accept inline overrides so `vitest.config.ts` can customize shared defaults without manually spreading nested config objects.** [`9372a11`](https://github.com/sonofmagic/monorepo-template/commit/9372a117c744c073084e439efcefb4a5123b2e64) by @sonofmagic

- 🐛 **Add stronger public types and richer config-entry JSDoc so monorepo tooling config files provide full editor hints, including defaults, usage notes, and override guidance.** [`24a6d4a`](https://github.com/sonofmagic/monorepo-template/commit/24a6d4a62ceedda64a68edb21235083ee3eccd64) by @sonofmagic

- 🐛 **Add `repo check --markdown` for PR-friendly recommended check plans.** [`bed9e4a`](https://github.com/sonofmagic/monorepo-template/commit/bed9e4a5ae7efd2540fc3190ebf24848a6575cd2) by @sonofmagic

- 🐛 **Add dry-run, JSON, and file output support for `repo check` verification plans.** [`21bbafb`](https://github.com/sonofmagic/monorepo-template/commit/21bbafb5b2b78f3b10e1ac7e9d621ca4ed877a8d) by @sonofmagic

- 🐛 **Add `repo check --redact` to hide local cwd and home paths in shared check plans.** [`2065670`](https://github.com/sonofmagic/monorepo-template/commit/2065670cf8cbd715e789be3b0c2487c115a851fe) by @sonofmagic

- 🐛 **Add `repo config inspect` to show the resolved repoctl config file and parsed config.** [`d43390b`](https://github.com/sonofmagic/monorepo-template/commit/d43390be5c835a2bb543fa4d07807b8545d90fdc) by @sonofmagic

- 🐛 **Add `repo config inspect --markdown --redact` for issue-friendly configuration diagnostics.** [`bf18b98`](https://github.com/sonofmagic/monorepo-template/commit/bf18b98760474ece3d1a30b9817fe483112e3d1d) by @sonofmagic

- 🐛 **Add JSON output for create dry-run previews so scripts can consume resolved scaffold plans without writing files.** [`23d6cea`](https://github.com/sonofmagic/monorepo-template/commit/23d6cead9327fc4f42aac35b2a2e4e6c40107b7e) by @sonofmagic

- 🐛 **Allow create dry-run previews to be written to files with `repo new --out`, including JSON plan output for automation.** [`fc5abeb`](https://github.com/sonofmagic/monorepo-template/commit/fc5abeb12b8dace9d1eacd85178f081f5a56d448) by @sonofmagic

- 🐛 **Support `repoctl.config.*` as the preferred config filename, keep `monorepo.config.*` compatible, and fail fast when both are present in the same workspace.** [`8f4dec9`](https://github.com/sonofmagic/monorepo-template/commit/8f4dec98100f121111ff9ca4d4fe6e8bef001abc) by @sonofmagic

- 🐛 **Add `repo doctor --markdown` for issue-friendly repository health reports.** [`281b636`](https://github.com/sonofmagic/monorepo-template/commit/281b6363b42e3e75da2463cf3282f0f4151bc113) by @sonofmagic

- 🐛 **Add `repo doctor --redact` to hide local workspace, cwd, and home paths in shared reports.** [`3eefad0`](https://github.com/sonofmagic/monorepo-template/commit/3eefad0a04cb789ab94c869e74214987fcaa2a86) by @sonofmagic

- 🐛 **Allow doctor reports to be written to files with `repo doctor --out`, including JSON reports for automation.** [`3b37308`](https://github.com/sonofmagic/monorepo-template/commit/3b373084b03d707c81f757b3b25414976004c6ad) by @sonofmagic

- 🐛 **Report all supported repoctl and monorepo config file candidates in `repo env paths` and support bundles.** [`12a200a`](https://github.com/sonofmagic/monorepo-template/commit/12a200a84b4b3fc8313359f9287fb90acbb36a9a) by @sonofmagic

- 🐛 **Add `repo env info` for text, JSON, and file-based environment diagnostics.** [`7eff57d`](https://github.com/sonofmagic/monorepo-template/commit/7eff57d09f7f8883da48dfe69e30faf4f028ccb9) by @sonofmagic

- 🐛 **Add Markdown and redacted output support to `repo env info`, `repo env snapshot`, and `repo env paths`.** [`35a66c9`](https://github.com/sonofmagic/monorepo-template/commit/35a66c99a62b5108cd50924f9e6bfd1372870e89) by @sonofmagic

- 🐛 **Add `repo env paths` to print key workspace files and report output targets for diagnostics.** [`c888771`](https://github.com/sonofmagic/monorepo-template/commit/c8887714738e015be319e8581cc1c65679831ea5) by @sonofmagic

- 🐛 **Add `--strict` support to `repo env snapshot` so CI can write a snapshot and fail on doctor warnings or failures.** [`78d69f0`](https://github.com/sonofmagic/monorepo-template/commit/78d69f0e431bff17e18db43d068a6174fec43710) by @sonofmagic

- 🐛 **Add `repo env snapshot` to collect environment, doctor, and check-plan diagnostics in one report.** [`f9d7395`](https://github.com/sonofmagic/monorepo-template/commit/f9d7395c094bb088cf2087e90da4c02374666817) by @sonofmagic

- 🐛 **Add `repo env support` to collect environment, path, config, doctor, and check-plan diagnostics in one report.** [`98953e9`](https://github.com/sonofmagic/monorepo-template/commit/98953e908553978984be7a5714155065036512cb) by @sonofmagic

- 🐛 **Add `repo env support --redact` to remove local absolute paths before sharing support bundles.** [`3ed8ef0`](https://github.com/sonofmagic/monorepo-template/commit/3ed8ef011958350096af5947b894a7bbc03ce1f9) by @sonofmagic

- 🐛 **Use `bin/monorepo.js` as the only CLI entry for local and published installs, and remove the legacy development bin wrapper.** [`b98361e`](https://github.com/sonofmagic/monorepo-template/commit/b98361ec4e59a5daf3f1f7dc92f5925f9d5c7367) by @sonofmagic

- 🐛 **Drop CommonJS outputs from `@icebreakers/monorepo` and publish ESM-only package artifacts.** [`a0d232b`](https://github.com/sonofmagic/monorepo-template/commit/a0d232b99ed2a38c126258bc3298e13b4993a1b2) by @sonofmagic

- 🐛 **Prefer `repoctl.config.ts` as the default generated config filename while keeping `monorepo.config.ts` compatible at runtime.** [`b66eccd`](https://github.com/sonofmagic/monorepo-template/commit/b66eccd34209de2713f490351f6f500501e44ef6) by @sonofmagic

- 🐛 **Add detailed JSDoc to the public `@icebreakers/monorepo` API so editors can surface usage notes, defaults, and examples directly from generated type declarations.** [`caafbcd`](https://github.com/sonofmagic/monorepo-template/commit/caafbcd915121dbf89f6c66a6c2f75babd65692f) by @sonofmagic

- 🐛 **Add thin `defineMonorepo*Config()` helpers so config entry files can delegate tooling config loading to `@icebreakers/monorepo/tooling`, and simplify shipped lint-staged and root config templates to use those wrappers.** [`be39aed`](https://github.com/sonofmagic/monorepo-template/commit/be39aed5751176004bd714088cf0a5b5e7f50722) by @sonofmagic

- 🐛 **Slim generated tooling entry files so shared engineering configs can use minimal `@icebreakers/monorepo/tooling` exports such as `defineEslintConfig()` and `defineVitestConfig()` without inline config-loading boilerplate.** [`fa92d5c`](https://github.com/sonofmagic/monorepo-template/commit/fa92d5cc71856517767850e17aa06c722b34a438) by @sonofmagic

- 🐛 **Add `rc` and `repo` bin aliases for the repo toolchain CLI.** [`437e738`](https://github.com/sonofmagic/monorepo-template/commit/437e738e19a9b006a84a32216016b65ed9bcaea0) by @sonofmagic

- 🐛 **Fix staged typecheck workspace resolution so scaffold asset files under `packages/monorepo/assets` resolve back to the real package workspace instead of being treated as executable workspaces themselves.** [`a6ad8ac`](https://github.com/sonofmagic/monorepo-template/commit/a6ad8ac68e957b2fb8ab15aef7abfafe2bdb8ca3) by @sonofmagic

- 🐛 **Add short `define*Config()` tooling helpers and switch config entrypoints to the simplified names while keeping `defineMonorepo*Config()` as backward-compatible aliases.** [`f148163`](https://github.com/sonofmagic/monorepo-template/commit/f1481639a53ff32033748a752b9c90059e3af6a7) by @sonofmagic

- 🐛 **Allow all default engineering config entrypoints to inherit overrides from `monorepo.config.ts`, including project-level Vitest defaults through `tooling.vitestProject`.** [`74d49db`](https://github.com/sonofmagic/monorepo-template/commit/74d49db5f1009aa4fe39a65088ff31df3779f301) by @sonofmagic

- 🐛 **Add a shared project-level Vitest helper in `@icebreakers/monorepo/tooling` and use it across template Vitest config entrypoints.** [`14ae14d`](https://github.com/sonofmagic/monorepo-template/commit/14ae14d7508dad2aa826d1a8227871c548a07f4b) by @sonofmagic

- 🐛 **Switch scaffolded pre-commit support back to `lint-staged` and ship `lint-staged.config.js` in template assets again.** [`2e4fc06`](https://github.com/sonofmagic/monorepo-template/commit/2e4fc06f2e94d05906679f266581d279704c21dc) by @sonofmagic

- 🐛 **Add `repo doctor --strict` so CI can fail on warnings, and document the strict diagnostic flow in the VitePress starter guide.** [`6a9a089`](https://github.com/sonofmagic/monorepo-template/commit/6a9a089eb04b7c869859c4459b1cfa9280629cef) by @sonofmagic

- 🐛 **Add `repo env support --markdown` for issue-friendly support bundle summaries.** [`bd53a04`](https://github.com/sonofmagic/monorepo-template/commit/bd53a04d90992e8772e8ae60f5e5c00251a9e3c4) by @sonofmagic

- 🐛 **Add `repo env support --strict` so CI can write support bundles before failing on doctor warnings or failures.** [`a3996ad`](https://github.com/sonofmagic/monorepo-template/commit/a3996adc3303571946038fa214a85afeb8d47f33) by @sonofmagic

- 🐛 **Change the default `create` template from `unbuild` to `tsdown` and remove redundant `sync` defaults from scaffolded monorepo config examples.** [`caafbcd`](https://github.com/sonofmagic/monorepo-template/commit/caafbcd915121dbf89f6c66a6c2f75babd65692f) by @sonofmagic

- 🐛 **Validate explicit template keys before scaffolding and expose template key suggestion helpers for better CLI guidance.** [`9c8e1d5`](https://github.com/sonofmagic/monorepo-template/commit/9c8e1d51b2b67358b765117932befc79599815f8) by @sonofmagic

- 🐛 **Clarify npm package metadata so `repoctl` is presented as the default task-first CLI, while `@icebreakers/monorepo` is described as the underlying engine and compatibility package.** [`2584972`](https://github.com/sonofmagic/monorepo-template/commit/2584972528044fb8b2c5207581ba8b6cddcdbeba) by @sonofmagic

- 🐛 **Add `tsd` type tests to library workspaces, wire a repository-level `tsd` task into Turbo validation, and fix the server template typecheck regression blocking full workspace checks.** [`15d7ac1`](https://github.com/sonofmagic/monorepo-template/commit/15d7ac1a2ef24a68ace40b2c41af2e491bb27a9f) by @sonofmagic

- 🐛 **Add Markdown and redacted output support to `repo workspace list`.** [`71ec33a`](https://github.com/sonofmagic/monorepo-template/commit/71ec33ab7c09d627a082ed56dd03218bd560ddca) by @sonofmagic

- 🐛 **Allow workspace package lists to be written to files with `repo ws ls --out`, including JSON output for automation.** [`342de08`](https://github.com/sonofmagic/monorepo-template/commit/342de084e14a1d71e6ec70ebbf5c24ccba39ced9) by @sonofmagic
- 📦 **Dependencies** [`eb56ff6`](https://github.com/sonofmagic/monorepo-template/commit/eb56ff644072f18475914c8f2860747d1f96046b)
  → `@icebreakers/monorepo-templates@1.0.0`

## 3.2.18

### Patch Changes

- 📦 **Dependencies** [`8056ffa`](https://github.com/sonofmagic/monorepo-template/commit/8056ffa380c765dae04de22ae21951216154ce8b)
  → `@icebreakers/monorepo-templates@0.1.16`

## 3.2.17

### Patch Changes

- 🐛 **Align template tooling with Vite 8 and stabilize monorepo template workflows.** [`454e65b`](https://github.com/sonofmagic/monorepo-template/commit/454e65b29e92dd7951261a28128cf8977bc5f290) by @sonofmagic
  - add a default export condition for `@icebreakers/monorepo-templates`
  - update shipped Vite templates for Vite 8 config expectations
  - add standard `build` scripts to the server template
  - make monorepo template tests repeatable and remove Vitest 4 warnings
- 📦 **Dependencies** [`454e65b`](https://github.com/sonofmagic/monorepo-template/commit/454e65b29e92dd7951261a28128cf8977bc5f290)
  → `@icebreakers/monorepo-templates@0.1.15`

## 3.2.16

### Patch Changes

- 📦 **Dependencies** [`505a29c`](https://github.com/sonofmagic/monorepo-template/commit/505a29c483f47f1ec7e04ff38dea7d331f65c951)
  → `@icebreakers/monorepo-templates@0.1.14`

## 3.2.15

### Patch Changes

- 🐛 **Rename the staged-file config from `lint-staged.config.js` to `nano-staged.js` and update generated monorepo assets accordingly.** [`2bf7b94`](https://github.com/sonofmagic/monorepo-template/commit/2bf7b94018c8c4dcf0608af0984a24737b330fe5) by @sonofmagic
- 📦 **Dependencies** [`d469409`](https://github.com/sonofmagic/monorepo-template/commit/d469409e065962372b1f9da5548e687f80b4ca33)
  → `@icebreakers/monorepo-templates@0.1.13`

## 3.2.14

### Patch Changes

- 📦 **Dependencies** [`52c30b0`](https://github.com/sonofmagic/monorepo-template/commit/52c30b0325a36e10f69eb36d90f794623d5ae5e1)
  → `@icebreakers/monorepo-templates@0.1.12`

## 3.2.13

### Patch Changes

- 🐛 **merge `.gitignore` during `monorepo up` instead of overwriting existing project rules.** [`bca9428`](https://github.com/sonofmagic/monorepo-template/commit/bca9428de15d1768911e2978f57cfbb124a0d1a4) by @sonofmagic
  - keep local ignore entries when `.gitignore` already exists
  - append only missing template rules and avoid duplicate entries
  - skip overwrite prompt when merged result is content-equivalent

## 3.2.12

### Patch Changes

- 🐛 **fix upgrade AGENTS merge to be idempotent and avoid duplicate section growth on repeated `monorepo up` runs.** [`ea5c77c`](https://github.com/sonofmagic/monorepo-template/commit/ea5c77c94e513686f6f54e752961efef5ff00f60) by @sonofmagic

## 3.2.11

### Patch Changes

- 🐛 **Improve `monorepo up` AGENTS handling and harden related type checks.** [`80a4318`](https://github.com/sonofmagic/monorepo-template/commit/80a4318faee69830a66902f175cc709962918abe) by @sonofmagic
  - Include `AGENTS.md` in upgrade asset targets.
  - Merge `AGENTS.md` by section instead of blindly overwriting existing content.
  - Fix TypeScript issues in `@icebreakers/monorepo` tests and `@icebreakers/monorepo-templates` scaffold options under `exactOptionalPropertyTypes`.
- 📦 **Dependencies** [`80a4318`](https://github.com/sonofmagic/monorepo-template/commit/80a4318faee69830a66902f175cc709962918abe)
  → `@icebreakers/monorepo-templates@0.1.11`

## 3.2.10

### Patch Changes

- 🐛 **Enforce stricter commit-time quality gates in scaffolded projects.** [`ac7b512`](https://github.com/sonofmagic/monorepo-template/commit/ac7b512e2aa506491381dde0299da2faaa88e375) by @sonofmagic

  - Add Stylelint checks for staged style files (including Vue SFC style blocks) in `lint-staged.config.js`.
  - Update agent rules to require build-first validation, ESLint/Stylelint, TypeScript error fixes, and `tsd` tests for TypeScript libraries before running test suites.

- 🐛 **Remove the deprecated VS Code ESLint lookup flag from template settings and upgrade fixtures.** [`b2e7b9f`](https://github.com/sonofmagic/monorepo-template/commit/b2e7b9fd3f089b3a46215618092b361e4382d06e) by @sonofmagic
- 📦 **Dependencies** [`ac7b512`](https://github.com/sonofmagic/monorepo-template/commit/ac7b512e2aa506491381dde0299da2faaa88e375)
  → `@icebreakers/monorepo-templates@0.1.10`

## 3.2.9

### Patch Changes

- 🐛 **Replace maintainer email metadata across packages and templates.** [`e3bd746`](https://github.com/sonofmagic/monorepo-template/commit/e3bd7460f2a48ca986b8a3c585be2f9235d5ec0f) by @sonofmagic
- 📦 **Dependencies** [`e3bd746`](https://github.com/sonofmagic/monorepo-template/commit/e3bd7460f2a48ca986b8a3c585be2f9235d5ec0f)
  → `@icebreakers/monorepo-templates@0.1.9`

## 3.2.8

### Patch Changes

- 📦 **Dependencies** [`408aee2`](https://github.com/sonofmagic/monorepo-template/commit/408aee277da61f071ef0bc57c6afb19e2399b354)
  → `@icebreakers/monorepo-templates@0.1.8`

## 3.2.7

### Patch Changes

- 📦 **Dependencies** [`3b1f6c9`](https://github.com/sonofmagic/monorepo-template/commit/3b1f6c9b64a8a665d933492014ef9653aacfa000)
  → `@icebreakers/monorepo-templates@0.1.7`

## 3.2.6

### Patch Changes

- 📦 **Dependencies** [`0001c27`](https://github.com/sonofmagic/monorepo-template/commit/0001c273fef5e8b5ce0b51a4faee53d6f669f0e9)
  → `@icebreakers/monorepo-templates@0.1.6`

## 3.2.5

### Patch Changes

- 📦 **Dependencies** [`d8a61a6`](https://github.com/sonofmagic/monorepo-template/commit/d8a61a6accc1f0a9bfefbd8ac3c4a6924ae09f87)
  → `@icebreakers/monorepo-templates@0.1.5`

## 3.2.4

### Patch Changes

- 📦 **Dependencies** [`10ee9a6`](https://github.com/sonofmagic/monorepo-template/commit/10ee9a6946d607bbbb320ab028a0eb3d9797fe25)
  → `@icebreakers/monorepo-templates@0.1.4`

## 3.2.3

### Patch Changes

- 📦 **Dependencies** [`2e19f0d`](https://github.com/sonofmagic/monorepo-template/commit/2e19f0d59346c497b35b000d3a2deffd3365f771)
  → `@icebreakers/monorepo-templates@0.1.3`

## 3.2.2

### Patch Changes

- 🐛 **refactor scaffolding to share template copy utilities** [`403e513`](https://github.com/sonofmagic/monorepo-template/commit/403e51348ed1a26ab9d8e6f5f2bce3f11f08bf60) by @sonofmagic
- 📦 **Dependencies** [`8258df9`](https://github.com/sonofmagic/monorepo-template/commit/8258df91e300e4cdbc39962495264aa43fe8e019)
  → `@icebreakers/monorepo-templates@0.1.2`

## 3.2.1

### Patch Changes

- 📦 **Dependencies** [`4e50f39`](https://github.com/sonofmagic/monorepo-template/commit/4e50f39fec14b846a125fb880d4ce8076d51ae26)
  → `@icebreakers/monorepo-templates@0.1.1`

## 3.2.0

### Minor Changes

- ✨ **新增 `monorepo skills sync` 命令，并将内置技能模板移动至 `resources/skills` 以便随包发布与同步。** [`89b355a`](https://github.com/sonofmagic/monorepo-template/commit/89b355a7c98b856045b829c4aedd0a7fbb22e290) by @sonofmagic

### Patch Changes

- 🐛 **将 commander、inquirer 与 execa 统一放入 monorepo-templates，并用更规范的 Commander 风格重写 create-icebreaker 的 CLI 解析。** [`e85a1df`](https://github.com/sonofmagic/monorepo-template/commit/e85a1df934c705eda24ad553d2c0844b16cb0f24) by @sonofmagic

- 🐛 **新增模板过滤与 gitignore 工具并集中复用，统一模板复制的忽略规则与文件名转换逻辑。** [`33133d7`](https://github.com/sonofmagic/monorepo-template/commit/33133d725c2575daac6e6db08fa681088009da15) by @sonofmagic
- 📦 **Dependencies** [`e85a1df`](https://github.com/sonofmagic/monorepo-template/commit/e85a1df934c705eda24ad553d2c0844b16cb0f24)
  → `@icebreakers/monorepo-templates@0.1.0`

## 3.1.18

### Patch Changes

- 🐛 **新增 monorepo CLI 的 Codex skill 与参考文档。** [`2da32fa`](https://github.com/sonofmagic/monorepo-template/commit/2da32fa15d6b3459de91f78034e051838b25a695) by @sonofmagic

## 3.1.17

### Patch Changes

- 🐛 **chore(deps): upgrade** [`569a730`](https://github.com/sonofmagic/monorepo-template/commit/569a7301910dbc067c23cd78e08d0c5deeec9e6d) by @sonofmagic

## 3.1.16

### Patch Changes

- 🐛 **chore(deps): upgrade** [`bfe55e7`](https://github.com/sonofmagic/monorepo-template/commit/bfe55e7a68dbb908267bf1845dfd11a6f23e9a4a) by @sonofmagic

## 3.1.15

### Patch Changes

- 🐛 **chore(deps): upgrade** [`9ee6086`](https://github.com/sonofmagic/monorepo-template/commit/9ee6086af81227adda6994d0c51f4e40855871bc) by @sonofmagic

## 3.1.14

### Patch Changes

- 🐛 **chore(deps): upgrade** [`2b71dea`](https://github.com/sonofmagic/monorepo-template/commit/2b71dead4c5ac12bfa3b9d03c00203af7a0758a2) by @sonofmagic

## 3.1.13

### Patch Changes

- [`1eac140`](https://github.com/sonofmagic/monorepo-template/commit/1eac1407e7d2a60e0fb990a8ae5510a8dac92340) Thanks [@sonofmagic](https://github.com/sonofmagic)! - feat(clean): 自动删除 .qoder 文件夹

  优化 `clean` 命令,现在执行清理操作时会自动删除项目根目录下的 `.qoder` 文件夹。

  **变更内容**:

  - 在清理候选列表中添加 `.qoder` 目录
  - 更新相关测试用例以验证新功能

  **影响范围**:

  - `monorepo clean` 命令
  - `pnpm script:clean` 命令

  `.qoder` 文件夹通常用于存储 AI 助手生成的临时文件和设计文档,在清理项目模板时删除这些文件有助于保持项目的干净状态。

## 3.1.12

### Patch Changes

- [`4f8f805`](https://github.com/sonofmagic/monorepo-template/commit/4f8f8055f5dd6f0f50ab1f888b05ac89e329a486) Thanks [@sonofmagic](https://github.com/sonofmagic)! - chore(deps): upgrade

## 3.1.11

### Patch Changes

- [`94380bf`](https://github.com/sonofmagic/monorepo-template/commit/94380bf78f2272a0c0c39e33158e930b7db5cf30) Thanks [@sonofmagic](https://github.com/sonofmagic)! - Ensure pnpm-workspace.yaml merges dedupe quoted globs and stringify with single quotes to avoid churn.

## 3.1.10

### Patch Changes

- [`b16e991`](https://github.com/sonofmagic/monorepo-template/commit/b16e9911a9958ad522514d4b216035fbdee765ba) Thanks [@sonofmagic](https://github.com/sonofmagic)! - chore(deps): upgrade

## 3.1.9

### Patch Changes

- [`9dbe29c`](https://github.com/sonofmagic/monorepo-template/commit/9dbe29c1a4ec729006c9de7c86b446fef997ef21) Thanks [@sonofmagic](https://github.com/sonofmagic)! - chore(deps): upgrade

## 3.1.8

### Patch Changes

- [`bf790ce`](https://github.com/sonofmagic/monorepo-template/commit/bf790ce66e3d7ace816e0ccdab104a1a5a5545ff) Thanks [@sonofmagic](https://github.com/sonofmagic)! - Keep `.github/ISSUE_TEMPLATE/config.yml` discussions links in sync with the current repository during init and upgrade.

## 3.1.7

### Patch Changes

- [`4b58df0`](https://github.com/sonofmagic/monorepo-template/commit/4b58df03e73476ee5cdf06805d7040bb30130b39) Thanks [@sonofmagic](https://github.com/sonofmagic)! - Make `monorepo clean` include private packages and remove README.zh-CN by default, plus document npm OIDC publishing guidance.

## 3.1.6

### Patch Changes

- [`616c7f7`](https://github.com/sonofmagic/monorepo-template/commit/616c7f794afd7c473e2024849d5cfda9d610965b) Thanks [@sonofmagic](https://github.com/sonofmagic)! - Avoid overwriting prepared assets/templates so concurrent Windows test runs do not hit EPERM unlink errors.

## 3.1.5

### Patch Changes

- [`1ec479c`](https://github.com/sonofmagic/monorepo-template/commit/1ec479c406f80a096f405c262358e04fb2d9e568) Thanks [@sonofmagic](https://github.com/sonofmagic)! - chore: update release.yml for oidc

## 3.1.4

### Patch Changes

- [`84e4003`](https://github.com/sonofmagic/monorepo-template/commit/84e40030b2602e59546360542c436d459bf4f086) Thanks [@sonofmagic](https://github.com/sonofmagic)! - chore(deps): upgrade

## 3.1.3

### Patch Changes

- [`592c45b`](https://github.com/sonofmagic/monorepo-template/commit/592c45bfc9f944dcf16331c975f2266e406943de) Thanks [@sonofmagic](https://github.com/sonofmagic)! - chore(deps): upgrade

## 3.1.2

### Patch Changes

- [`d0876c2`](https://github.com/sonofmagic/monorepo-template/commit/d0876c24a0f494dd90580cd7853e38daa7f5f589) Thanks [@sonofmagic](https://github.com/sonofmagic)! - Add merge-on-upgrade for `pnpm-workspace.yaml` so missing defaults are filled without overwriting existing workspace settings.

## 3.1.1

### Patch Changes

- [`6f3701a`](https://github.com/sonofmagic/monorepo-template/commit/6f3701af531916c2b90e3ce52a67d35c7c454fa8) Thanks [@sonofmagic](https://github.com/sonofmagic)! - chore(deps): upgrade

## 3.1.0

### Minor Changes

- [`3de7c13`](https://github.com/sonofmagic/monorepo-template/commit/3de7c13f6c0320a0bb9790af52d51264a6e644db) Thanks [@sonofmagic](https://github.com/sonofmagic)! - 新增 `monorepo ai create`，支持按名称或任务清单批量生成 Agentic 任务模板，格式/目录/覆盖策略可通过 `monorepo.config.ts` 预设并同步到文档示例。

## 3.0.3

### Patch Changes

- [`a17fc49`](https://github.com/sonofmagic/monorepo-template/commit/a17fc49723980a7bd865f25b8bd6b6111f66233e) Thanks [@sonofmagic](https://github.com/sonofmagic)! - chore(deps): upgrade

## 3.0.2

### Patch Changes

- [`1300cc7`](https://github.com/sonofmagic/monorepo-template/commit/1300cc76cacce8e824d82cb5c48e7be91f886cc1) Thanks [@sonofmagic](https://github.com/sonofmagic)! - chore(deps): upgrade

## 3.0.1

### Patch Changes

- [`9b08c05`](https://github.com/sonofmagic/monorepo-template/commit/9b08c0523b0edbaee35acd4837ee78b3d771f9d5) Thanks [@sonofmagic](https://github.com/sonofmagic)! - chore(deps): upgrade

## 3.0.0

### Major Changes

- [`bddd7c2`](https://github.com/sonofmagic/monorepo-template/commit/bddd7c2e140e9c50a8a7051a9f489470e9e416b0) Thanks [@sonofmagic](https://github.com/sonofmagic)! - Adopted `@inquirer/prompts@8.0.0` which is ESM-only and enforces `Node >=23.5.0 || ^22.13.0 || ^21.7.0 || ^20.12.0`. Users must upgrade Node before updating to this release.

## 2.2.0

### Minor Changes

- [`df74551`](https://github.com/sonofmagic/monorepo-template/commit/df745515f7adabcae2ee95611d0e1727de3582bb) Thanks [@sonofmagic](https://github.com/sonofmagic)! - feat: 优化智能提示

## 2.1.6

### Patch Changes

- [`25fb7d7`](https://github.com/sonofmagic/monorepo-template/commit/25fb7d76cd906a0ead3ef352467d030603a165bd) Thanks [@sonofmagic](https://github.com/sonofmagic)! - chore(deps): upgrade

## 2.1.5

### Patch Changes

- [`b9bd4fb`](https://github.com/sonofmagic/monorepo-template/commit/b9bd4fb54b2d5b0cc0d12f2cd18d8409e9e327b1) Thanks [@sonofmagic](https://github.com/sonofmagic)! - chore(deps): upgrade

## 2.1.4

### Patch Changes

- [`bba3ccc`](https://github.com/sonofmagic/monorepo-template/commit/bba3ccca25aa8abbef0dcfb3c06711f8d9ef4419) Thanks [@sonofmagic](https://github.com/sonofmagic)! - chore(deps): upgrade

## 2.1.3

### Patch Changes

- [`4608802`](https://github.com/sonofmagic/monorepo-template/commit/46088022d2f874e9dea2092744bf0706d0d43f44) Thanks [@sonofmagic](https://github.com/sonofmagic)! - chore(deps): upgrade

## 2.1.2

### Patch Changes

- [`a198e74`](https://github.com/sonofmagic/monorepo-template/commit/a198e74280f00464176c04cc70911da6386bd95a) Thanks [@sonofmagic](https://github.com/sonofmagic)! - Handle pnpm `catalog:` version specifiers during `monorepo up` so catalog-managed dependencies are preserved without semver parsing errors.

## 2.1.1

### Patch Changes

- [`6d97e86`](https://github.com/sonofmagic/monorepo-template/commit/6d97e86ebbe8001ce916857d2a07a8f4447a6c78) Thanks [@sonofmagic](https://github.com/sonofmagic)! - feat: add tsdown template and expose it via monorepo create choices

- [`0f4d105`](https://github.com/sonofmagic/monorepo-template/commit/0f4d105052b61bf29909dbe29f3f49c841792f20) Thanks [@sonofmagic](https://github.com/sonofmagic)! - feat: scaffolded packages now inherit repository, bugs, and author metadata from the current git remote

- [`f5a7a60`](https://github.com/sonofmagic/monorepo-template/commit/f5a7a6029d546e7bf21e6d6636eefe426bacc4af) Thanks [@sonofmagic](https://github.com/sonofmagic)! - chore: migrate shared Vitest setup and templates to Vitest v4

## 2.1.0

### Minor Changes

- [`fc82dd5`](https://github.com/sonofmagic/monorepo-template/commit/fc82dd57d4dc83b8f0dde664cc54525da51fd1db) Thanks [@sonofmagic](https://github.com/sonofmagic)! - Drop the legacy `--raw`/`--minimal-assets` upgrade flags in favor of the concise `-c/--core` switch and align documentation accordingly.

## 2.0.12

### Patch Changes

- [`6c67c57`](https://github.com/sonofmagic/monorepo-template/commit/6c67c57c4b5225571c100918ee32dcc0bd8fc9d9) Thanks [@sonofmagic](https://github.com/sonofmagic)! - chore(deps): upgrade

## 2.0.11

### Patch Changes

- [`57c5818`](https://github.com/sonofmagic/monorepo-template/commit/57c5818634227b88a9652fa00f850cb659a7864a) Thanks [@sonofmagic](https://github.com/sonofmagic)! - Unifies the gitignore renaming logic under shared utilities, improving consistency across publish, create, and upgrade flows.

## 2.0.10

### Patch Changes

- [`37506a4`](https://github.com/sonofmagic/monorepo-template/commit/37506a4be5fe245cd87dc357b882faeebf57cde4) Thanks [@sonofmagic](https://github.com/sonofmagic)! - Add a diff-aware overwrite selection to `monorepo up`, prompting once for all changed files and refactoring the upgrade helpers for reuse.

## 2.0.9

### Patch Changes

- [`ace9269`](https://github.com/sonofmagic/monorepo-template/commit/ace926931e6d2bf97f8086ec9b32ac1999ddd56c) Thanks [@sonofmagic](https://github.com/sonofmagic)! - Improve `setPkgJson` so dependency updates skip downgrades by comparing versions with semver, and add test coverage for the new behavior.

## 2.0.8

### Patch Changes

- [`b685002`](https://github.com/sonofmagic/monorepo-template/commit/b68500259af733e37ae0301ebb1678ceffae3e6d) Thanks [@sonofmagic](https://github.com/sonofmagic)! - Improve unit test coverage for CLI helpers and template packages.

## 2.0.7

### Patch Changes

- [`30bdd3c`](https://github.com/sonofmagic/monorepo-template/commit/30bdd3c16c134457cea74d449db01d881115e656) Thanks [@sonofmagic](https://github.com/sonofmagic)! - chore(deps): upgrade

## 2.0.6

### Patch Changes

- [`a035f9c`](https://github.com/sonofmagic/monorepo-template/commit/a035f9c800b6daadfb17b0a5247db5caba6343a0) Thanks [@sonofmagic](https://github.com/sonofmagic)! - chore(deps): upgrade

## 2.0.5

### Patch Changes

- [`2f4987f`](https://github.com/sonofmagic/monorepo-template/commit/2f4987f0124835aa5285ea81dc156c83dae77e9c) Thanks [@sonofmagic](https://github.com/sonofmagic)! - chore(deps): upgrade

## 2.0.3

### Patch Changes

- [`49056aa`](https://github.com/sonofmagic/monorepo-template/commit/49056aa67b665c823f120ef07a0223ca257358bc) Thanks [@sonofmagic](https://github.com/sonofmagic)! - chore(deps): upgrade

## 2.0.2

### Patch Changes

- [`6d347ad`](https://github.com/sonofmagic/monorepo-template/commit/6d347ad1c9ec669878871ca9c1a0c5a153d8d0d1) Thanks [@sonofmagic](https://github.com/sonofmagic)! - chore(deps): upgrade

## 2.0.1

### Patch Changes

- [`b1e3200`](https://github.com/sonofmagic/monorepo-template/commit/b1e3200f2e19afb3a5b6c50f68a26d927089548e) Thanks [@sonofmagic](https://github.com/sonofmagic)! - chore(deps): upgrade

## 2.0.0

### Major Changes

- [`51bc3dd`](https://github.com/sonofmagic/monorepo-template/commit/51bc3dd0d244190606d8402f28eafce30b9b933e) Thanks [@sonofmagic](https://github.com/sonofmagic)! - ## 重大更新说明

  - 重写 `upgradeMonorepo` 的写入与交互逻辑，统一覆盖策略、支持交互式目标选择，并新增 `package.json` 差异合并与镜像同步并发修复。
  - 增强 `syncNpmMirror`、`setReadme`、`setPkgJson`、`setVscodeBinaryMirror` 等关键流程的稳定性，涵盖空包名、缺失 Git 信息以及 VS Code 配置合并等边界场景。
  - 为 CLI、命令式入口、工作区工具、镜像配置、Git 客户端与散列工具补充系统化单元测试，将覆盖率提升至语句 99% 以上，确保 2.x 版本行为可验证。
  - 依赖清理与工具链调整：基于 Husky 9 和 Turbo 配置优化，所有脚本默认采用 `pnpm exec`，并落地 lint/测试任务的依赖传递策略。
  - 重构命令架构：拆分 `core/`、`commands/`、`cli/` 三层结构，CLI 入口仅负责解析参数，命令实现复用核心上下文，配套测试与资产脚本已同步调整。
  - 新增配置中心：通过 `monorepo.config.ts`（由 `c12@3.3.0` 解析）即可覆写 create / clean / sync / upgrade / init / mirror 等命令的默认行为，并提供 `defineMonorepoConfig` 辅助函数；模板与快照随之更新。
  - 命令行为增强：
    - `create` 支持自定义模板映射、选择项以及自动重命名输出路径。
    - `clean` 新增自动确认、忽略列表与依赖版本钉固选项。
    - `sync` 支持自定义并发、命令模板（含 `{name}` 占位符）与包白名单。
    - `upgrade` 可配置目标文件、脚本覆盖以及是否跳过 Changeset Markdown；同时导出 `setPkgJson` 以便外部复用。
    - `init` 支持按需跳过 README / package.json / Changeset 的写入。
    - `mirror` 允许覆盖 VS Code 终端镜像环境变量。
  - 文档与示例更新：在 README 与 assets 中新增配置示例、保留的 `monorepo.config.ts` 模板，以及相应的测试覆盖与快照同步。

  > 这是一个破坏性更新，建议在升级到 `@icebreakers/monorepo@2.x` 前阅读对应文档与优化记录，确认流水线脚本、同步流程及 README 初始化逻辑是否符合预期。

## 1.2.4

### Patch Changes

- [`484d3c8`](https://github.com/sonofmagic/monorepo-template/commit/484d3c82438c13758e3300c6db6888cda9277232) Thanks [@sonofmagic](https://github.com/sonofmagic)! - chore(deps): upgrade

## 1.2.3

### Patch Changes

- [`91c6377`](https://github.com/sonofmagic/monorepo-template/commit/91c637727429b22968cf69457737ce5bded7c9b4) Thanks [@sonofmagic](https://github.com/sonofmagic)! - chore: remove big dts file

## 1.2.2

### Patch Changes

- [`d1550ae`](https://github.com/sonofmagic/monorepo-template/commit/d1550ae5cdf73dbe06adcd47a61ce3dbce3d5acb) Thanks [@sonofmagic](https://github.com/sonofmagic)! - chore: upgrade eslint

## 1.2.1

### Patch Changes

- [`7498c4a`](https://github.com/sonofmagic/monorepo-template/commit/7498c4a52d2cd3f98284814d6fad35eb1b17c201) Thanks [@sonofmagic](https://github.com/sonofmagic)! - fix: template copy to files

## 1.2.0

### Minor Changes

- [`35f403a`](https://github.com/sonofmagic/monorepo-template/commit/35f403a366f8a1c6eb20c1baee352bdcc36789b0) Thanks [@sonofmagic](https://github.com/sonofmagic)! - feat: 添加 server , client, cli 模板

## 1.1.8

### Patch Changes

- [`2f0b860`](https://github.com/sonofmagic/monorepo-template/commit/2f0b8601872bfa4f94a94d03c71d1a0ed9eb0c18) Thanks [@sonofmagic](https://github.com/sonofmagic)! - chore(deps): upgrade

## 1.1.7

### Patch Changes

- [`aecf565`](https://github.com/sonofmagic/monorepo-template/commit/aecf56513a4f14de48696780cb0714fc052469ba) Thanks [@sonofmagic](https://github.com/sonofmagic)! - chore(deps): upgrade

## 1.1.6

### Patch Changes

- [`5059f6b`](https://github.com/sonofmagic/monorepo-template/commit/5059f6b0f97bf454440d342a580b88c10848b91e) Thanks [@sonofmagic](https://github.com/sonofmagic)! - chore(deps): upgrade

## 1.1.5

### Patch Changes

- [`f178672`](https://github.com/sonofmagic/monorepo-template/commit/f17867218f8a7943449a966377ff63648dd8655d) Thanks [@sonofmagic](https://github.com/sonofmagic)! - chore: upgrade deps

## 1.1.4

### Patch Changes

- [`0acee04`](https://github.com/sonofmagic/monorepo-template/commit/0acee046bcab6c6799e03a08809e033ef9a3b287) Thanks [@sonofmagic](https://github.com/sonofmagic)! - chore: 升级 `@icebreakers/eslint-config` 到 `1.4.0`, 添加 `tailwindcss@4` 支持

## 1.1.3

### Patch Changes

- [`f3c12f7`](https://github.com/sonofmagic/monorepo-template/commit/f3c12f7f45b25a8afb189bf29b15ae0fe77862af) Thanks [@sonofmagic](https://github.com/sonofmagic)! - chore: upgrade setup-node from 4 to 5

## 1.1.2

### Patch Changes

- [`2a13f92`](https://github.com/sonofmagic/monorepo-template/commit/2a13f9202c5af268ca22a57f81321c8f275819ae) Thanks [@sonofmagic](https://github.com/sonofmagic)! - chore: 升级 pnpm 版本

## 1.1.1

### Patch Changes

- [`83860a8`](https://github.com/sonofmagic/monorepo-template/commit/83860a89994c764ed310eeb1d1c955f2a28b5ac4) Thanks [@sonofmagic](https://github.com/sonofmagic)! - docs: update

## 1.1.0

### Minor Changes

- [`660f406`](https://github.com/sonofmagic/monorepo-template/commit/660f4060ce9d2d41fa881b8e163c18d44497ab01) Thanks [@sonofmagic](https://github.com/sonofmagic)! - refactor: @icebreakers/monorepo

## 1.0.17

### Patch Changes

- [`23ae5a0`](https://github.com/sonofmagic/monorepo-template/commit/23ae5a094904e2cb149f8861bf040091e61cb59e) Thanks [@sonofmagic](https://github.com/sonofmagic)! - chore: 增强 clean 命令

## 1.0.15

### Patch Changes

- [`f612395`](https://github.com/sonofmagic/monorepo-template/commit/f6123958f4236bad3296f7bf8cb5c952fb04bd48) Thanks [@sonofmagic](https://github.com/sonofmagic)! - chore(deps): upgrade

## 1.0.14

### Patch Changes

- [`547cbef`](https://github.com/sonofmagic/monorepo-template/commit/547cbef27ce7b11776cd7aae1542aa8d296487b2) Thanks [@sonofmagic](https://github.com/sonofmagic)! - chore(vue-lib-template): add tailwindcss

## 1.0.12

### Patch Changes

- [`8da3534`](https://github.com/sonofmagic/monorepo-template/commit/8da3534256ef4733194d9bb94c0d4970426d53d2) Thanks [@sonofmagic](https://github.com/sonofmagic)! - chore: 更新 vue 模板

## 1.0.11

### Patch Changes

- [`05c5606`](https://github.com/sonofmagic/monorepo-template/commit/05c560648e2cd82412fb82c9a2d8279c96a21bcc) Thanks [@sonofmagic](https://github.com/sonofmagic)! - chore: add skip-overwrite options and commitlint script

## 1.0.7

### Patch Changes

- [`db3001f`](https://github.com/sonofmagic/monorepo-template/commit/db3001fcb45bd74d00e80d9cd08e6bfd86d8a4a1) Thanks [@sonofmagic](https://github.com/sonofmagic)! - chore: upgrade version

## 1.0.6

### Patch Changes

- [`e40bab0`](https://github.com/sonofmagic/monorepo-template/commit/e40bab0eb958bd73906b070a35c8a241916f0402) Thanks [@sonofmagic](https://github.com/sonofmagic)! - chore: bump version

- [`ddc7d98`](https://github.com/sonofmagic/monorepo-template/commit/ddc7d981ee84c11999beaa9aa05cfeeb41177d7b) Thanks [@sonofmagic](https://github.com/sonofmagic)! - chore: bump version

## 1.0.5

### Patch Changes

- [`50dedac`](https://github.com/sonofmagic/monorepo-template/commit/50dedac2185884cc02601c3c04931341da2f3691) Thanks [@sonofmagic](https://github.com/sonofmagic)! - chore: bump version

## 1.0.4

### Patch Changes

- [`9cee86b`](https://github.com/sonofmagic/monorepo-template/commit/9cee86bc713a00ec604be7472cc4b96cf709c94a) Thanks [@sonofmagic](https://github.com/sonofmagic)! - chore: bump version

## 1.0.3

### Patch Changes

- [`89a3797`](https://github.com/sonofmagic/monorepo-template/commit/89a37976c96fb48d205b328e880fec6db1251114) Thanks [@sonofmagic](https://github.com/sonofmagic)! - chore: sync deps

## 1.0.2

### Patch Changes

- [`2d476ca`](https://github.com/sonofmagic/monorepo-template/commit/2d476ca3ed97a783641bef6c18463adee8f9a6e5) Thanks [@sonofmagic](https://github.com/sonofmagic)! - chore: rename template

## 1.0.1

### Patch Changes

- [`5b0f078`](https://github.com/sonofmagic/monorepo-template/commit/5b0f07808fca25560f36d87b3e0f992e005ac0dc) Thanks [@sonofmagic](https://github.com/sonofmagic)! - fix: add setChangeset for `script:init`

## 1.0.0

### Major Changes

- [`4e4e97d`](https://github.com/sonofmagic/monorepo-template/commit/4e4e97d59f81e32066b31e2737c948db86e2acca) Thanks [@sonofmagic](https://github.com/sonofmagic)! - chore!: 提升依赖最低需要 nodejs@20 版本

## 0.7.9

### Patch Changes

- [`98c85fd`](https://github.com/sonofmagic/monorepo-template/commit/98c85fd3528a0714699411772202b8d7a5aaa195) Thanks [@sonofmagic](https://github.com/sonofmagic)! - feat: 默认 new 模板更改 unbuild，同时使用 stub 进行多个项目进行链接

## 0.7.3

### Patch Changes

- [`e329a9a`](https://github.com/sonofmagic/monorepo-template/commit/e329a9a649ba60dc7b825920fbce17ec5977dedb) Thanks [@sonofmagic](https://github.com/sonofmagic)! - chore: add vitest.workspace.ts vitest vscode plugin

## 0.7.2

### Patch Changes

- [`6e613a1`](https://github.com/sonofmagic/monorepo-template/commit/6e613a1eba65014d19855a3eb5da31c356feb767) Thanks [@sonofmagic](https://github.com/sonofmagic)! - feat!: upgrade pnpm from 9 -> 10

## 0.7.1

### Patch Changes

- [`8f81cac`](https://github.com/sonofmagic/monorepo-template/commit/8f81cacd86041462f1ffe62f45793a7c95ae6be8) Thanks [@sonofmagic](https://github.com/sonofmagic)! - chore(deps): upgrade

## 0.7.0

### Minor Changes

- [`33139f4`](https://github.com/sonofmagic/monorepo-template/commit/33139f4da024f87127e4242e2e8b812658235c73) Thanks [@sonofmagic](https://github.com/sonofmagic)! - feat: confirmOverwrite default true

## 0.6.23

### Patch Changes

- [`a7a62de`](https://github.com/sonofmagic/monorepo-template/commit/a7a62de070cae2485f374827d571a3465e2de32d) Thanks [@sonofmagic](https://github.com/sonofmagic)! - chore(deps): upgrade

## 0.6.19

### Patch Changes

- [`96576d1`](https://github.com/sonofmagic/monorepo-template/commit/96576d1b107066f7c46f2ab458dc2e4ea1a4f593) Thanks [@sonofmagic](https://github.com/sonofmagic)! - chore(deps): upgrade

## 0.6.18

### Patch Changes

- [`3f25923`](https://github.com/sonofmagic/monorepo-template/commit/3f259234ed2e2cdf0069ab647511fd29327b3d1e) Thanks [@sonofmagic](https://github.com/sonofmagic)! - chore(deps): upgrade

## 0.6.17

### Patch Changes

- [`a4aa3e9`](https://github.com/sonofmagic/monorepo-template/commit/a4aa3e9e201668bcc116e495f8fb5d90d9e59826) Thanks [@sonofmagic](https://github.com/sonofmagic)! - fix: sonar issue

## 0.6.14

### Patch Changes

- [`ee96d2f`](https://github.com/sonofmagic/monorepo-template/commit/ee96d2f76f1ea2bc8ff5b899e119f1a045ee8702) Thanks [@sonofmagic](https://github.com/sonofmagic)! - feat: 添加 command 的 description

## 0.6.13

### Patch Changes

- [`0196b4a`](https://github.com/sonofmagic/monorepo-template/commit/0196b4a79fd51577e6aadfeb0239c00a49b9fbb3) Thanks [@sonofmagic](https://github.com/sonofmagic)! - chore(deps): upgrade

## 0.6.3

### Patch Changes

- [`1b1f95e`](https://github.com/sonofmagic/monorepo-template/commit/1b1f95e6f67666b95c3844187a030a942e514ae1) Thanks [@sonofmagic](https://github.com/sonofmagic)! - feat: 默认不覆盖 workspace: 注册的包，cnpm sync 的时候，默认跳过 root 的包，只包括那些 workspace

## 0.5.0

### Minor Changes

- [`5b9a48f`](https://github.com/sonofmagic/monorepo-template/commit/5b9a48f0037aed5fc29520cbc91b5be59e647ee3) Thanks [@sonofmagic](https://github.com/sonofmagic)! - 内置整个 cli 功能，去除 scripts/monorepo 相关功能

## 0.4.6

### Patch Changes

- [`d85811a`](https://github.com/sonofmagic/monorepo-template/commit/d85811a60ef85df3beb2a2e0c9bdb332d1656e6a) Thanks [@sonofmagic](https://github.com/sonofmagic)! - fix: github action ci/pr error
