# @icebreakers/monorepo-templates

## 2.0.3

### Patch Changes

- Keep generated repoctl workspaces aligned with the source workspace package manager and guide agents to use the latest repoctl create entrypoint.

  Refresh stale local metadata, preserve the complete pnpm version declaration, and enforce it through Corepack and the workspace package-manager policy. Ship the strict npmrc asset under a publishable filename and restore it during creation and upgrades.

## 2.0.2

### Patch Changes

- Update repository links for the move to the icelib GitHub organization and migrate the release workflow to npm trusted publishing. Package names and public APIs are unchanged.

## 2.0.1

### Patch Changes

- chore(deps): update all non-major dependencies (#898)

## 2.0.0

### Major Changes

- Require Node.js 22.13 or newer. These packages no longer advertise Node 18 support.

### Minor Changes

- Give agents a non-interactive create path, a user-facing AGENTS.md, and a repoctl skill that can scaffold a workspace from an empty directory.

### Patch Changes

- Keep Astro, Svelte, and extra Prettier plugins consumer-provided instead of copying them from the workspace root.

- Use Vite native config loader compatible imports in the Vue library template.

- Use a pnpm catalog for duplicated package versions without copying catalog specifiers into generated workspaces.

- Bump lint-staged, UnoCSS, Vite 8.3, wrangler, and packaged template dependencies.

- Drop unused root toolchain leftovers and declare defu and UnoCSS ESLint plugins on the packages that actually use them.

## 1.3.5

### Patch Changes

- Generate Cloudflare Worker declarations before development, builds and type checks; exclude generated types from templates and restore them from task caches.

## 1.3.4

### Patch Changes

- chore(deps): update all non-major dependencies (#874)

- chore(deps): update all non-major dependencies (#876)

## 1.3.3

### Patch Changes

- Update dependencies in the monorepo templates package. (#865)

## 1.3.2

### Patch Changes

- 统一所有公开包的 repoctl 仓库、文档、问题反馈和 npm 首页元数据，移除旧的 dev-configs 标识，并同步双语 README 的项目链接。

## 1.3.1

### Patch Changes

- Ship the repoctl brand assets, favicons, and localized social preview images with the VitePress template.

- Redesign the VitePress template homepage with a task-first layout, real doctor output, and responsive bilingual styling.

## 1.3.0

### Minor Changes

- Remove the retired Netlify deployment asset from managed workspace templates.

### Patch Changes

- 统一 Release workflow 的触发检测，并在质量门禁前校验 workspace 依赖协议。

## 1.2.1

### Patch Changes

- 更新托管 release workflow，固定 Actions 完整 SHA、拉取完整 Git 历史，并清理模板中的仓库专属 versioning 状态。

## 1.2.0

### Minor Changes

- Reposition repoctl as the task-first CLI for pnpm and Turborepo monorepos, add English-default and Simplified Chinese CLI/documentation support, make create-repoctl the canonical workspace creator, and keep compatibility entrypoints working.

## 1.1.0

### Minor Changes

- 迁移到 pnpm 原生 versioning，使用 `pnpm change`、`pnpm version -r`、`pnpm publish -r` 和 lanes 管理版本、变更日志与预发布流程。

### Patch Changes

- 修复 release CI 未向 repoctl 注入 GitHub Actions 原生的 `github.token`，导致 Release PR、tag 和 GitHub Release 编排无法调用 GitHub API。

- 将 GitHub Release 编排下沉到 repoctl，新增统一的 `repo release ci` 入口，并支持旧模板 release workflow 与 Changesets prerelease 状态的一键迁移。

- 修复模板 Vitest 配置在 Vite 原生配置加载器下的路径和扩展名兼容性警告。

## 1.0.15

### Patch Changes

- 🐛 **Stop generated Cloudflare templates from rewriting Worker types during dependency installation, and add an explicit type freshness check to their typecheck scripts.** [`376b346`](https://github.com/sonofmagic/monorepo-template/commit/376b346748a23d2ad2738cc5a45772933d4aac74) by @sonofmagic

- 🐛 **Keep the committed Cloudflare Worker types synchronized with Wrangler updates and add root commands for regenerating or checking both Worker templates.** [#786](https://github.com/sonofmagic/monorepo-template/pull/786) by @renovate

- 🐛 **Isolate browser, Node.js, and Cloudflare Worker type environments in generated client and server templates.** [`6f0e68c`](https://github.com/sonofmagic/monorepo-template/commit/6f0e68c7f33b278b7794af9327dd8b2acfb6f326) by @sonofmagic

- 🐛 **Handle Changesets v3 empty-version runs in repo release commands and update generated release workflows to changesets/action v2.** [`b580b94`](https://github.com/sonofmagic/monorepo-template/commit/b580b94619f8cffc3c482bf17e1f0cdca96106c7) by @sonofmagic

## 1.0.14

### Patch Changes

- 🐛 **deps: upgrade** [`0f2322d`](https://github.com/sonofmagic/monorepo-template/commit/0f2322d8f10e4264697e53ab6b357aab2f8ea452) by @sonofmagic

## 1.0.13

### Patch Changes

- 🐛 **deps: upgrade** [`38f1652`](https://github.com/sonofmagic/monorepo-template/commit/38f1652729cd17c8b86f06b2b30922f25f93ef32) by @sonofmagic

## 1.0.12

### Patch Changes

- 🐛 **deps: upgrade** [`16b22ad`](https://github.com/sonofmagic/monorepo-template/commit/16b22adce6df418aef2af7827cf903fa9a00b2f4) by @sonofmagic

## 1.0.11

### Patch Changes

- 🐛 **修复 Vue 库模板在新版声明文件插件下缺少 `dist/index.d.ts`，导致类型测试和发布类型入口失效的问题。** [#718](https://github.com/sonofmagic/monorepo-template/pull/718) by @renovate
  - 修复 Windows 环境准备发布模板资产时未移除源码仓库专用 release tooling 构建步骤的问题。

## 1.0.10

### Patch Changes

- 🐛 **Remove the source repository's release tooling build step from generated template assets.** [`dd6f262`](https://github.com/sonofmagic/monorepo-template/commit/dd6f2628e70ee5af5e6d8caa4631b6a47d515a54) by @sonofmagic

## 1.0.9

### Patch Changes

- 🐛 **deps: upgrade** [`8462aa3`](https://github.com/sonofmagic/monorepo-template/commit/8462aa310b63a06fc3242c406f9da969c1cd3650) by @sonofmagic

## 1.0.8

### Patch Changes

- 🐛 **deps: upgrade** [`171cafa`](https://github.com/sonofmagic/monorepo-template/commit/171cafa4d5943754138cd7ff49434214a33b7919) by @sonofmagic

## 1.0.7

### Patch Changes

- 🐛 **Remove stale TypeScript `ignoreDeprecations` suppressions from published and generated tsconfig files.** [`77b6c50`](https://github.com/sonofmagic/monorepo-template/commit/77b6c500775a589edd952614cedda4f303a92847) by @sonofmagic

## 1.0.6

### Patch Changes

- 🐛 **deps: upgrade** [`1e153cf`](https://github.com/sonofmagic/monorepo-template/commit/1e153cf048afac70c43e4586dd3fa345e53b4589) by @sonofmagic

## 1.0.5

### Patch Changes

- 🐛 **Enrich the VitePress template documentation with separate knowledge, tools, and AI sections plus expanded repoctl guides.** [`8f026a8`](https://github.com/sonofmagic/monorepo-template/commit/8f026a856a68e75732655a55d0a8107d5c9fae3f) by @sonofmagic

## 1.0.4

### Patch Changes

- 🐛 **Add VitePress llms.txt generation and highlight AI documentation entry points in the website template.** [`7382054`](https://github.com/sonofmagic/monorepo-template/commit/738205498217006b548ee03a8d03ecc356371cb8) by @sonofmagic

## 1.0.3

### Patch Changes

- 🐛 **repoctl now ships a publishable `tsconfig.json` entry for direct `extends` usage, and generated templates write that same public entry instead of relying on a local base file.** [`67a2ed5`](https://github.com/sonofmagic/monorepo-template/commit/67a2ed50cc2782fa7fc45a6ce2811a389e84173d) by @sonofmagic

- 🐛 **Internalize stable and prerelease Changesets publishing in `repo release` commands so generated repositories no longer need copied release scripts.** [`3f67b4c`](https://github.com/sonofmagic/monorepo-template/commit/3f67b4ca9a486cbd8590fa558238044f5e282ccf) by @sonofmagic

- 🐛 **Internalize the template asset sync runner into package source so maintainers no longer need a separate `scripts/sync-assets.mjs` file.** [`f6a1b21`](https://github.com/sonofmagic/monorepo-template/commit/f6a1b21fda4c8d4979246cd19e2ce32c3d9c5ee2) by @sonofmagic

- 🐛 **release 流程改为按分支分流：`main` 只发正式包，`alpha`、`beta`、`rc`、`next` 仅以 Changesets pre 模式发布对应 tag 包，并补齐了相关文档说明。** [`758a57f`](https://github.com/sonofmagic/monorepo-template/commit/758a57f788aceb66cf77afc17ea379f4e0003af9) by @sonofmagic

## 1.0.2

### Patch Changes

- 🐛 **Fix asset preparation so existing generated asset directories can still receive missing files from the current repository templates.** [`f24eb48`](https://github.com/sonofmagic/monorepo-template/commit/f24eb48a8457d1d491af5756bd442b1027aa37a1) by @sonofmagic

## 1.0.1

### Patch Changes

- 🐛 **Fix the Vue library template package metadata and type tests for Vite plugin dts output.** [`a209464`](https://github.com/sonofmagic/monorepo-template/commit/a209464efbbe64a5cc507d0fbf3110ce5e91dde1) by @sonofmagic

- 🐛 **Replace remaining tsup and unbuild template build scripts with tsdown.** [`bd38e6c`](https://github.com/sonofmagic/monorepo-template/commit/bd38e6c91a7347a7de6e7db219e6138745805488) by @sonofmagic

## 1.0.0

### Major Changes

- 🚀 **Remove the legacy `tsup` and `unbuild` library templates from the repository and scaffolding flow.** [`5a0dae9`](https://github.com/sonofmagic/monorepo-template/commit/5a0dae99cc3c0eef74f88c1c0da01c5f58552042) by @sonofmagic
  - `monorepo new`, `repoctl new`, and `create-icebreaker` no longer offer `tsup` or `unbuild` as built-in template keys. The bundled template asset set and related docs have been updated to standardize on `tsdown` as the only generic TypeScript library template.

### Minor Changes

- ✨ **Validate explicit template keys before scaffolding and expose template key suggestion helpers for better CLI guidance.** [`9c8e1d5`](https://github.com/sonofmagic/monorepo-template/commit/9c8e1d51b2b67358b765117932befc79599815f8) by @sonofmagic

### Patch Changes

- 🐛 **Add the new `repoctl` package as the preferred repo toolchain entrypoint while keeping `@icebreakers/monorepo` published and version-linked for compatibility. Template assets, docs, hooks, and config defaults now prefer `repoctl`, and cleanup/upgrade flows preserve whichever helper package a workspace already uses.** [`eb56ff6`](https://github.com/sonofmagic/monorepo-template/commit/eb56ff644072f18475914c8f2860747d1f96046b) by @sonofmagic

- 🐛 **Add `repo config inspect` to show the resolved repoctl config file and parsed config.** [`d43390b`](https://github.com/sonofmagic/monorepo-template/commit/d43390be5c835a2bb543fa4d07807b8545d90fdc) by @sonofmagic

- 🐛 **Report all supported repoctl and monorepo config file candidates in `repo env paths` and support bundles.** [`12a200a`](https://github.com/sonofmagic/monorepo-template/commit/12a200a84b4b3fc8313359f9287fb90acbb36a9a) by @sonofmagic

- 🐛 **Add `repo env paths` to print key workspace files and report output targets for diagnostics.** [`c888771`](https://github.com/sonofmagic/monorepo-template/commit/c8887714738e015be319e8581cc1c65679831ea5) by @sonofmagic

- 🐛 **Add `repo env support` to collect environment, path, config, doctor, and check-plan diagnostics in one report.** [`98953e9`](https://github.com/sonofmagic/monorepo-template/commit/98953e908553978984be7a5714155065036512cb) by @sonofmagic

- 🐛 **Add `repo env support --redact` to remove local absolute paths before sharing support bundles.** [`3ed8ef0`](https://github.com/sonofmagic/monorepo-template/commit/3ed8ef011958350096af5947b894a7bbc03ce1f9) by @sonofmagic

- 🐛 **Prefer `repoctl.config.ts` as the default generated config filename while keeping `monorepo.config.ts` compatible at runtime.** [`b66eccd`](https://github.com/sonofmagic/monorepo-template/commit/b66eccd34209de2713f490351f6f500501e44ef6) by @sonofmagic

- 🐛 **Add thin `defineMonorepo*Config()` helpers so config entry files can delegate tooling config loading to `@icebreakers/monorepo/tooling`, and simplify shipped lint-staged and root config templates to use those wrappers.** [`be39aed`](https://github.com/sonofmagic/monorepo-template/commit/be39aed5751176004bd714088cf0a5b5e7f50722) by @sonofmagic

- 🐛 **Align template linting entry files with `@icebreakers/monorepo` tooling wrappers and monorepo-config-driven defaults.** [`ff9dea2`](https://github.com/sonofmagic/monorepo-template/commit/ff9dea258937a01e68fcdfeb4eb8b846f3a8731e) by @sonofmagic

- 🐛 **Allow all default engineering config entrypoints to inherit overrides from `monorepo.config.ts`, including project-level Vitest defaults through `tooling.vitestProject`.** [`74d49db`](https://github.com/sonofmagic/monorepo-template/commit/74d49db5f1009aa4fe39a65088ff31df3779f301) by @sonofmagic

- 🐛 **Add a shared project-level Vitest helper in `@icebreakers/monorepo/tooling` and use it across template Vitest config entrypoints.** [`14ae14d`](https://github.com/sonofmagic/monorepo-template/commit/14ae14d7508dad2aa826d1a8227871c548a07f4b) by @sonofmagic

- 🐛 **Switch scaffolded pre-commit support back to `lint-staged` and ship `lint-staged.config.js` in template assets again.** [`2e4fc06`](https://github.com/sonofmagic/monorepo-template/commit/2e4fc06f2e94d05906679f266581d279704c21dc) by @sonofmagic

- 🐛 **Add `repo doctor --strict` so CI can fail on warnings, and document the strict diagnostic flow in the VitePress starter guide.** [`6a9a089`](https://github.com/sonofmagic/monorepo-template/commit/6a9a089eb04b7c869859c4459b1cfa9280629cef) by @sonofmagic

- 🐛 **Add affected-workspace pre-push quality gates for build, test, and tsd, and align CI to run typecheck and tsd explicitly.** [`8296d3a`](https://github.com/sonofmagic/monorepo-template/commit/8296d3ac586f2f5c961c96ffe2ee21ee0da99b87) by @sonofmagic

- 🐛 **Improve template discovery and scaffolding developer experience with template listing/check commands, create dry-run previews, structured doctor output, and beginner documentation.** [`c237abc`](https://github.com/sonofmagic/monorepo-template/commit/c237abc0bfc3fd16e70efd1fea5f4c82fac8a3eb) by @sonofmagic

- 🐛 **Add `tsd` type tests to library workspaces, wire a repository-level `tsd` task into Turbo validation, and fix the server template typecheck regression blocking full workspace checks.** [`15d7ac1`](https://github.com/sonofmagic/monorepo-template/commit/15d7ac1a2ef24a68ace40b2c41af2e491bb27a9f) by @sonofmagic

## 0.1.16

### Patch Changes

- 🐛 **deps: upgrade** [`8056ffa`](https://github.com/sonofmagic/monorepo-template/commit/8056ffa380c765dae04de22ae21951216154ce8b) by @sonofmagic

## 0.1.15

### Patch Changes

- 🐛 **Align template tooling with Vite 8 and stabilize monorepo template workflows.** [`454e65b`](https://github.com/sonofmagic/monorepo-template/commit/454e65b29e92dd7951261a28128cf8977bc5f290) by @sonofmagic
  - add a default export condition for `@icebreakers/monorepo-templates`
  - update shipped Vite templates for Vite 8 config expectations
  - add standard `build` scripts to the server template
  - make monorepo template tests repeatable and remove Vitest 4 warnings

## 0.1.14

### Patch Changes

- 🐛 **deps: upgrade** [`505a29c`](https://github.com/sonofmagic/monorepo-template/commit/505a29c483f47f1ec7e04ff38dea7d331f65c951) by @sonofmagic

## 0.1.13

### Patch Changes

- 🐛 **deps: upgrade** [`d469409`](https://github.com/sonofmagic/monorepo-template/commit/d469409e065962372b1f9da5548e687f80b4ca33) by @sonofmagic

- 🐛 **Rename the staged-file config from `lint-staged.config.js` to `nano-staged.js` and update generated monorepo assets accordingly.** [`2bf7b94`](https://github.com/sonofmagic/monorepo-template/commit/2bf7b94018c8c4dcf0608af0984a24737b330fe5) by @sonofmagic

## 0.1.12

### Patch Changes

- 🐛 **deps: upgrade** [`52c30b0`](https://github.com/sonofmagic/monorepo-template/commit/52c30b0325a36e10f69eb36d90f794623d5ae5e1) by @sonofmagic

## 0.1.11

### Patch Changes

- 🐛 **Improve `monorepo up` AGENTS handling and harden related type checks.** [`80a4318`](https://github.com/sonofmagic/monorepo-template/commit/80a4318faee69830a66902f175cc709962918abe) by @sonofmagic
  - Include `AGENTS.md` in upgrade asset targets.
  - Merge `AGENTS.md` by section instead of blindly overwriting existing content.
  - Fix TypeScript issues in `@icebreakers/monorepo` tests and `@icebreakers/monorepo-templates` scaffold options under `exactOptionalPropertyTypes`.

## 0.1.10

### Patch Changes

- 🐛 **Enforce stricter commit-time quality gates in scaffolded projects.** [`ac7b512`](https://github.com/sonofmagic/monorepo-template/commit/ac7b512e2aa506491381dde0299da2faaa88e375) by @sonofmagic

  - Add Stylelint checks for staged style files (including Vue SFC style blocks) in `lint-staged.config.js`.
  - Update agent rules to require build-first validation, ESLint/Stylelint, TypeScript error fixes, and `tsd` tests for TypeScript libraries before running test suites.

- 🐛 **Remove the deprecated VS Code ESLint lookup flag from template settings and upgrade fixtures.** [`b2e7b9f`](https://github.com/sonofmagic/monorepo-template/commit/b2e7b9fd3f089b3a46215618092b361e4382d06e) by @sonofmagic

## 0.1.9

### Patch Changes

- 🐛 **Replace maintainer email metadata across packages and templates.** [`e3bd746`](https://github.com/sonofmagic/monorepo-template/commit/e3bd7460f2a48ca986b8a3c585be2f9235d5ec0f) by @sonofmagic

## 0.1.8

### Patch Changes

- 🐛 **deps: upgrade** [`408aee2`](https://github.com/sonofmagic/monorepo-template/commit/408aee277da61f071ef0bc57c6afb19e2399b354) by @sonofmagic

## 0.1.7

### Patch Changes

- 🐛 **chore(deps): upgrade** [`3b1f6c9`](https://github.com/sonofmagic/monorepo-template/commit/3b1f6c9b64a8a665d933492014ef9653aacfa000) by @sonofmagic

## 0.1.6

### Patch Changes

- 🐛 **chore(deps): upgrade** [`0001c27`](https://github.com/sonofmagic/monorepo-template/commit/0001c273fef5e8b5ce0b51a4faee53d6f669f0e9) by @sonofmagic

## 0.1.5

### Patch Changes

- 🐛 **chore(deps): upgrade jsdom** [`d8a61a6`](https://github.com/sonofmagic/monorepo-template/commit/d8a61a6accc1f0a9bfefbd8ac3c4a6924ae09f87) by @sonofmagic

## 0.1.4

### Patch Changes

- 🐛 **chore(deps): upgrade** [`10ee9a6`](https://github.com/sonofmagic/monorepo-template/commit/10ee9a6946d607bbbb320ab028a0eb3d9797fe25) by @sonofmagic

## 0.1.3

### Patch Changes

- 🐛 **chore(deps): upgrade** [`2e19f0d`](https://github.com/sonofmagic/monorepo-template/commit/2e19f0d59346c497b35b000d3a2deffd3365f771) by @sonofmagic

## 0.1.2

### Patch Changes

- 🐛 **refactor vue-lib template to library-only layout** [`8258df9`](https://github.com/sonofmagic/monorepo-template/commit/8258df91e300e4cdbc39962495264aa43fe8e019) by @sonofmagic

- 🐛 **refactor scaffolding to share template copy utilities** [`403e513`](https://github.com/sonofmagic/monorepo-template/commit/403e51348ed1a26ab9d8e6f5f2bce3f11f08bf60) by @sonofmagic

## 0.1.1

### Patch Changes

- 🐛 **Consolidate skeleton into assets and scaffold new projects from assets.** [`4e50f39`](https://github.com/sonofmagic/monorepo-template/commit/4e50f39fec14b846a125fb880d4ce8076d51ae26) by @sonofmagic

## 0.1.0

### Minor Changes

- ✨ **新增模板资源包，包含最小根骨架与可选应用/包模板。** [`004f522`](https://github.com/sonofmagic/monorepo-template/commit/004f522ad32e8201860dd36b92900ac529a9ce68) by @sonofmagic

- ✨ **新增模板过滤与 gitignore 工具并集中复用，统一模板复制的忽略规则与文件名转换逻辑。** [`33133d7`](https://github.com/sonofmagic/monorepo-template/commit/33133d725c2575daac6e6db08fa681088009da15) by @sonofmagic

### Patch Changes

- 🐛 **将 commander、inquirer 与 execa 统一放入 monorepo-templates，并用更规范的 Commander 风格重写 create-icebreaker 的 CLI 解析。** [`e85a1df`](https://github.com/sonofmagic/monorepo-template/commit/e85a1df934c705eda24ad553d2c0844b16cb0f24) by @sonofmagic
