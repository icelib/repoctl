# repoctl

## 5.5.4

### Patch Changes

- Updated dependencies:
  - @icebreakers/monorepo@5.5.4

## 5.5.3

### Patch Changes

- Updated dependencies:
  - @icebreakers/monorepo@5.5.3

## 5.5.2

### Patch Changes

- Harden GitHub release recovery with rate limit aware retries and an explicit create-missing repair mode.

- Updated dependencies:
  - @icebreakers/monorepo@5.5.2

## 5.5.1

### Patch Changes

- Retry transient release API failures and reconcile partially published releases

- Updated dependencies:
  - @icebreakers/monorepo@5.5.1

## 5.5.0

### Minor Changes

- Require Node.js 22.13 or newer and normalize package metadata.

- Give agents a non-interactive create path, a user-facing AGENTS.md, and a repoctl skill that can scaffold a workspace from an empty directory.

### Patch Changes

- Use a pnpm catalog for duplicated package versions without copying catalog specifiers into generated workspaces.

- Updated dependencies:
  - @icebreakers/monorepo@5.5.0

## 5.4.9

### Patch Changes

- Updated dependencies:
  - @icebreakers/monorepo@5.4.9

## 5.4.8

### Patch Changes

- chore(deps): update all non-major dependencies (#874)

- Updated dependencies:
  - @icebreakers/monorepo@5.4.8

## 5.4.7

### Patch Changes

- Updated dependencies:
  - @icebreakers/monorepo@5.4.7

## 5.4.6

### Patch Changes

- 统一所有公开包的 repoctl 仓库、文档、问题反馈和 npm 首页元数据，移除旧的 dev-configs 标识，并同步双语 README 的项目链接。

- Updated dependencies:
  - @icebreakers/monorepo@5.4.6

## 5.4.5

### Patch Changes

- Updated dependencies:
  - @icebreakers/monorepo@5.4.5

## 5.4.4

### Patch Changes

- 发布 npm provenance 时遇到瞬时签名服务错误会自动按未发布包重试，并在包已上传但客户端未收到响应时继续完成发布流程。

- Updated dependencies:
  - @icebreakers/monorepo@5.4.4

## 5.4.3

### Patch Changes

- Resolve the bundled TypeScript baseline through package exports so repoctl tooling works after installation.

- Updated dependencies:
  - @icebreakers/monorepo@5.4.3

## 5.4.2

### Patch Changes

- Updated dependencies:
  - @icebreakers/monorepo@5.4.2

## 5.4.1

### Patch Changes

- 统一 Release workflow 的触发检测，并在质量门禁前校验 workspace 依赖协议。

- Update package homepage metadata and documentation links to the repoctl domain.

- Updated dependencies:
  - @icebreakers/monorepo@5.4.1

## 5.4.0

### Minor Changes

- 完善发布后钩子的实际发布判断与容错配置，并修复打包后 doctor 的 Vitest 依赖解析。

### Patch Changes

- Updated dependencies:
  - @icebreakers/monorepo@5.4.0

## 5.3.0

### Patch Changes

- Updated dependencies:
  - @icebreakers/monorepo@5.3.0

## 5.2.0

### Minor Changes

- Reposition repoctl as the task-first CLI for pnpm and Turborepo monorepos, add English-default and Simplified Chinese CLI/documentation support, make create-repoctl the canonical workspace creator, and keep compatibility entrypoints working.

### Patch Changes

- Updated dependencies:
  - @icebreakers/monorepo@5.2.0

## 5.1.1

### Patch Changes

- Updated dependencies:
  - @icebreakers/monorepo@5.1.1

## 5.1.0

### Patch Changes

- Updated dependencies:
  - @icebreakers/monorepo@5.1.0

## 5.0.3

### Patch Changes

- 📦 **Dependencies** [`b580b94`](https://github.com/sonofmagic/monorepo-template/commit/b580b94619f8cffc3c482bf17e1f0cdca96106c7)
  → `@icebreakers/monorepo@5.0.3`

## 5.0.2

### Patch Changes

- 📦 **Dependencies**
  → `@icebreakers/monorepo@5.0.2`

## 5.0.1

### Patch Changes

- 📦 **Dependencies**
  → `@icebreakers/monorepo@5.0.1`

## 5.0.0

### Major Changes

- 🚀 **最低运行环境升级为 Node 22.12.0，并使用已修复 GitHub 元数据容错逻辑的 changelog 工具链。** [`89922fe`](https://github.com/sonofmagic/monorepo-template/commit/89922fe9bfd0b9528288f96df2648784a1e14a9d) by @sonofmagic

### Patch Changes

- 📦 **Dependencies** [`89922fe`](https://github.com/sonofmagic/monorepo-template/commit/89922fe9bfd0b9528288f96df2648784a1e14a9d)
  → `@icebreakers/monorepo@5.0.0`

## 4.0.13

### Patch Changes

- 📦 **Dependencies**
  → `@icebreakers/monorepo@4.0.13`

## 4.0.12

### Patch Changes

- 📦 **Dependencies**
  → `@icebreakers/monorepo@4.0.12`

## 4.0.11

### Patch Changes

- 📦 **Dependencies** [`d115c08`](https://github.com/sonofmagic/monorepo-template/commit/d115c08963412e9ee638e9d56e0f9feca75baf9d)
  → `@icebreakers/monorepo@4.0.11`

## 4.0.10

### Patch Changes

- 📦 **Dependencies** [`8462aa3`](https://github.com/sonofmagic/monorepo-template/commit/8462aa310b63a06fc3242c406f9da969c1cd3650)
  → `@icebreakers/monorepo@4.0.10`

## 4.0.9

### Patch Changes

- 📦 **Dependencies**
  → `@icebreakers/monorepo@4.0.9`

## 4.0.8

### Patch Changes

- 🐛 **Remove stale TypeScript `ignoreDeprecations` suppressions from published and generated tsconfig files.** [`77b6c50`](https://github.com/sonofmagic/monorepo-template/commit/77b6c500775a589edd952614cedda4f303a92847) by @sonofmagic
- 📦 **Dependencies** [`77b6c50`](https://github.com/sonofmagic/monorepo-template/commit/77b6c500775a589edd952614cedda4f303a92847)
  → `@icebreakers/monorepo@4.0.8`

## 4.0.7

### Patch Changes

- 📦 **Dependencies**
  → `@icebreakers/monorepo@4.0.7`

## 4.0.6

### Patch Changes

- 🐛 **Upgrade the bundled Icebreakers ESLint and Stylelint presets so repoctl/tooling uses the upstream peer dependency ownership fixes instead of carrying lint ecosystem dependencies in the monorepo runtime package.** [`540c09e`](https://github.com/sonofmagic/monorepo-template/commit/540c09ee1d3cc825f638d8bf8d3d8aaa21ee8a07) by @sonofmagic
- 📦 **Dependencies** [`540c09e`](https://github.com/sonofmagic/monorepo-template/commit/540c09ee1d3cc825f638d8bf8d3d8aaa21ee8a07)
  → `@icebreakers/monorepo@4.0.6`

## 4.0.5

### Patch Changes

- 📦 **Dependencies**
  → `@icebreakers/monorepo@4.0.5`

## 4.0.4

### Patch Changes

- 🐛 **Update package homepage metadata and documentation links to repo.icebreaker.top.** [`cb6fd63`](https://github.com/sonofmagic/monorepo-template/commit/cb6fd63cfc18df526d2c42072711dba500096d57) by @sonofmagic
- 📦 **Dependencies** [`cb6fd63`](https://github.com/sonofmagic/monorepo-template/commit/cb6fd63cfc18df526d2c42072711dba500096d57)
  → `@icebreakers/monorepo@4.0.4`

## 4.0.3

### Patch Changes

- 🐛 **repoctl now ships a publishable `tsconfig.json` entry for direct `extends` usage, and generated templates write that same public entry instead of relying on a local base file.** [`67a2ed5`](https://github.com/sonofmagic/monorepo-template/commit/67a2ed50cc2782fa7fc45a6ce2811a389e84173d) by @sonofmagic

- 🐛 **Internalize stable and prerelease Changesets publishing in `repo release` commands so generated repositories no longer need copied release scripts.** [`3f67b4c`](https://github.com/sonofmagic/monorepo-template/commit/3f67b4ca9a486cbd8590fa558238044f5e282ccf) by @sonofmagic

- 🐛 **release 流程改为按分支分流：`main` 只发正式包，`alpha`、`beta`、`rc`、`next` 仅以 Changesets pre 模式发布对应 tag 包，并补齐了相关文档说明。** [`758a57f`](https://github.com/sonofmagic/monorepo-template/commit/758a57f788aceb66cf77afc17ea379f4e0003af9) by @sonofmagic
- 📦 **Dependencies** [`67a2ed5`](https://github.com/sonofmagic/monorepo-template/commit/67a2ed50cc2782fa7fc45a6ce2811a389e84173d)
  → `@icebreakers/monorepo@4.0.3`

## 4.0.2

### Patch Changes

- 📦 **Dependencies** [`1666827`](https://github.com/sonofmagic/monorepo-template/commit/166682749b167b0caa06aff52134fb0d79c6ef15)
  → `@icebreakers/monorepo@4.0.2`

## 4.0.1

### Patch Changes

- 📦 **Dependencies**
  → `@icebreakers/monorepo@4.0.1`

## 4.0.0

### Major Changes

- 🚀 **Remove the legacy `tsup` and `unbuild` library templates from the repository and scaffolding flow.** [`5a0dae9`](https://github.com/sonofmagic/monorepo-template/commit/5a0dae99cc3c0eef74f88c1c0da01c5f58552042) by @sonofmagic
  - `monorepo new`, `repoctl new`, and `create-icebreaker` no longer offer `tsup` or `unbuild` as built-in template keys. The bundled template asset set and related docs have been updated to standardize on `tsdown` as the only generic TypeScript library template.

### Minor Changes

- ✨ **Add task-first `repoctl` entrypoints such as `init`, `new`, `check`, and `upgrade`, plus compatibility top-level commands for `sync`, `clean`, and `mirror`.** [`72ebd27`](https://github.com/sonofmagic/monorepo-template/commit/72ebd27b7498ee6f9176d984612a0496a201d140) by @sonofmagic

  - Refresh the guided package creation flow to start from user intent, add `init --preset` support, and align package docs, template docs, and create-icebreaker guidance around the new lower-cost onboarding path.

- ✨ **Add the new `repoctl` package as the preferred repo toolchain entrypoint while keeping `@icebreakers/monorepo` published and version-linked for compatibility. Template assets, docs, hooks, and config defaults now prefer `repoctl`, and cleanup/upgrade flows preserve whichever helper package a workspace already uses.** [`eb56ff6`](https://github.com/sonofmagic/monorepo-template/commit/eb56ff644072f18475914c8f2860747d1f96046b) by @sonofmagic

- ✨ **Remove the legacy `sync` CLI command and its related config support from the monorepo toolchain.** [`e7e26eb`](https://github.com/sonofmagic/monorepo-template/commit/e7e26eb0e962ecb9ddbf6a1f69a36e28dedf9302) by @sonofmagic

- ✨ **Improve template discovery and scaffolding developer experience with template listing/check commands, create dry-run previews, structured doctor output, and beginner documentation.** [`c237abc`](https://github.com/sonofmagic/monorepo-template/commit/c237abc0bfc3fd16e70efd1fea5f4c82fac8a3eb) by @sonofmagic

### Patch Changes

- 🐛 **Add `repo check --markdown` for PR-friendly recommended check plans.** [`bed9e4a`](https://github.com/sonofmagic/monorepo-template/commit/bed9e4a5ae7efd2540fc3190ebf24848a6575cd2) by @sonofmagic

- 🐛 **Add dry-run, JSON, and file output support for `repo check` verification plans.** [`21bbafb`](https://github.com/sonofmagic/monorepo-template/commit/21bbafb5b2b78f3b10e1ac7e9d621ca4ed877a8d) by @sonofmagic

- 🐛 **Add `repo check --redact` to hide local cwd and home paths in shared check plans.** [`2065670`](https://github.com/sonofmagic/monorepo-template/commit/2065670cf8cbd715e789be3b0c2487c115a851fe) by @sonofmagic

- 🐛 **Add `repo config inspect --markdown --redact` for issue-friendly configuration diagnostics.** [`bf18b98`](https://github.com/sonofmagic/monorepo-template/commit/bf18b98760474ece3d1a30b9817fe483112e3d1d) by @sonofmagic

- 🐛 **Add JSON output for create dry-run previews so scripts can consume resolved scaffold plans without writing files.** [`23d6cea`](https://github.com/sonofmagic/monorepo-template/commit/23d6cead9327fc4f42aac35b2a2e4e6c40107b7e) by @sonofmagic

- 🐛 **Allow create dry-run previews to be written to files with `repo new --out`, including JSON plan output for automation.** [`fc5abeb`](https://github.com/sonofmagic/monorepo-template/commit/fc5abeb12b8dace9d1eacd85178f081f5a56d448) by @sonofmagic

- 🐛 **Support `repoctl.config.*` as the preferred config filename, keep `monorepo.config.*` compatible, and fail fast when both are present in the same workspace.** [`8f4dec9`](https://github.com/sonofmagic/monorepo-template/commit/8f4dec98100f121111ff9ca4d4fe6e8bef001abc) by @sonofmagic

- 🐛 **Add `repo doctor --markdown` for issue-friendly repository health reports.** [`281b636`](https://github.com/sonofmagic/monorepo-template/commit/281b6363b42e3e75da2463cf3282f0f4151bc113) by @sonofmagic

- 🐛 **Add `repo doctor --redact` to hide local workspace, cwd, and home paths in shared reports.** [`3eefad0`](https://github.com/sonofmagic/monorepo-template/commit/3eefad0a04cb789ab94c869e74214987fcaa2a86) by @sonofmagic

- 🐛 **Allow doctor reports to be written to files with `repo doctor --out`, including JSON reports for automation.** [`3b37308`](https://github.com/sonofmagic/monorepo-template/commit/3b373084b03d707c81f757b3b25414976004c6ad) by @sonofmagic

- 🐛 **Add `repo env info` for text, JSON, and file-based environment diagnostics.** [`7eff57d`](https://github.com/sonofmagic/monorepo-template/commit/7eff57d09f7f8883da48dfe69e30faf4f028ccb9) by @sonofmagic

- 🐛 **Add Markdown and redacted output support to `repo env info`, `repo env snapshot`, and `repo env paths`.** [`35a66c9`](https://github.com/sonofmagic/monorepo-template/commit/35a66c99a62b5108cd50924f9e6bfd1372870e89) by @sonofmagic

- 🐛 **Add `--strict` support to `repo env snapshot` so CI can write a snapshot and fail on doctor warnings or failures.** [`78d69f0`](https://github.com/sonofmagic/monorepo-template/commit/78d69f0e431bff17e18db43d068a6174fec43710) by @sonofmagic

- 🐛 **Add `repo env snapshot` to collect environment, doctor, and check-plan diagnostics in one report.** [`f9d7395`](https://github.com/sonofmagic/monorepo-template/commit/f9d7395c094bb088cf2087e90da4c02374666817) by @sonofmagic

- 🐛 **Prefer `repoctl.config.ts` as the default generated config filename while keeping `monorepo.config.ts` compatible at runtime.** [`b66eccd`](https://github.com/sonofmagic/monorepo-template/commit/b66eccd34209de2713f490351f6f500501e44ef6) by @sonofmagic

- 🐛 **Add `rc` and `repo` bin aliases for the repo toolchain CLI.** [`437e738`](https://github.com/sonofmagic/monorepo-template/commit/437e738e19a9b006a84a32216016b65ed9bcaea0) by @sonofmagic

- 🐛 **Allow all default engineering config entrypoints to inherit overrides from `monorepo.config.ts`, including project-level Vitest defaults through `tooling.vitestProject`.** [`74d49db`](https://github.com/sonofmagic/monorepo-template/commit/74d49db5f1009aa4fe39a65088ff31df3779f301) by @sonofmagic

- 🐛 **Add `repo env support --markdown` for issue-friendly support bundle summaries.** [`bd53a04`](https://github.com/sonofmagic/monorepo-template/commit/bd53a04d90992e8772e8ae60f5e5c00251a9e3c4) by @sonofmagic

- 🐛 **Add `repo env support --strict` so CI can write support bundles before failing on doctor warnings or failures.** [`a3996ad`](https://github.com/sonofmagic/monorepo-template/commit/a3996adc3303571946038fa214a85afeb8d47f33) by @sonofmagic

- 🐛 **Validate explicit template keys before scaffolding and expose template key suggestion helpers for better CLI guidance.** [`9c8e1d5`](https://github.com/sonofmagic/monorepo-template/commit/9c8e1d51b2b67358b765117932befc79599815f8) by @sonofmagic

- 🐛 **Clarify npm package metadata so `repoctl` is presented as the default task-first CLI, while `@icebreakers/monorepo` is described as the underlying engine and compatibility package.** [`2584972`](https://github.com/sonofmagic/monorepo-template/commit/2584972528044fb8b2c5207581ba8b6cddcdbeba) by @sonofmagic

- 🐛 **Add Markdown and redacted output support to `repo workspace list`.** [`71ec33a`](https://github.com/sonofmagic/monorepo-template/commit/71ec33ab7c09d627a082ed56dd03218bd560ddca) by @sonofmagic

- 🐛 **Allow workspace package lists to be written to files with `repo ws ls --out`, including JSON output for automation.** [`342de08`](https://github.com/sonofmagic/monorepo-template/commit/342de084e14a1d71e6ec70ebbf5c24ccba39ced9) by @sonofmagic
- 📦 **Dependencies** [`9372a11`](https://github.com/sonofmagic/monorepo-template/commit/9372a117c744c073084e439efcefb4a5123b2e64)
  → `@icebreakers/monorepo@4.0.0`
