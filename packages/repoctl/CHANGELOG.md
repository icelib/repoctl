# repoctl

## 5.8.1

### Patch Changes

- Reduce CLI and isolated test startup costs by discovering workspace manifests without loading pnpm installation internals, and loading ESLint plugins and Vitest configuration merging only when requested. Workspace inspection includes packages for other platforms and retains pnpm manifest formats, exclusion patterns, sorting and symlink identities.

- Recover historical releases with their declared pnpm version, reconcile failed checkpoint writes before retrying with the original revision, and report only unfinished lifecycle targets when preparing the next release.

- Retry transient GitHub release checkpoint failures so an accepted npm publication can resume safely.

- Updated dependencies:
  - @icebreakers/monorepo@5.8.1

## 5.8.0

### Minor Changes

- 增加独立的逐包 npm OIDC 核验、脱敏报告与受管工作流入口，说明 trusted publisher 首次发布时限及过期恢复边界。

### Patch Changes

- Updated dependencies:
  - @icebreakers/monorepo@5.8.0

## 5.7.1

### Patch Changes

- 隔离发布验证脚本的控制环境，避免恢复参数污染测试

- 修复 npm 发布确认的延迟可见处理并同步发布文档

- Updated dependencies:
  - @icebreakers/monorepo@5.7.1

## 5.7.0

### Minor Changes

- 增加公共 API 报告与显式基线更新入口，复用本地 API Extractor 分析构建声明，提供可审核的签名 diff、change intent 建议及带冲突检测和事务恢复的更新计划。

- 提供版本化根迁移计划与执行账本，记录成功、失败和中断恢复状态，保留逐文件审核、并发保护和既有 Changesets 到 pnpm 迁移行为。

- 提供模板作者验证 helper 和 CLI，在隔离工作区执行生成、安装、构建、规范、类型与产物测试，验证真实 tarball 的导出和依赖，并保留可诊断失败报告。

- Add previewable component and Hono route generators for existing workspace packages, with typed parameters, framework checks, conflict protection, structured export edits and transactional rollback.

  Support generation inside moved parameterized packages while retaining independent template instances and sensitive-file exclusions.

- 新增 react-lib 组件库模板，提供 ESM、公开 props 类型和显式 CSS 出口，保留 React peer 外置，并验证独立 tarball 消费方的类型、样式与交互。

- 新增只读工作区依赖图与 why/impact 查询，支持私有包、workspace 别名、稳定 JSON 和 Mermaid 输出，并诊断缺失或歧义引用。

- Add offline third-party dependency admission policies, explicit exceptions and expiry reminders, reviewed baseline comparison, stable JSON and opt-in doctor checks.

- Validate repoctl-owned configuration before command side effects, explain shared defaults and overrides, and redact sensitive report values. Correct the generated lint-staged repoCommand field.

  Validate public API report settings and keep configuration loading free of filesystem cache writes during read-only commands.

- Add read-only internal dependency cycle and architecture boundary checks, typed rule exceptions, stable diagnostics and opt-in doctor integration.

- Add offline doctor checks for runtime versions, manifest/lockfile consistency, and recorded pnpm installation state.

- Merge root managed assets against verified upstream baselines while preserving local edits, deletion intent, and transactional recovery.

- Support fixed npm and Git template assets with verified offline caches, explicit asset fetching, reproducible creation plans and recorded remote provenance.

- 支持隔离构建与校验 PR/nightly 快照包，使用精确临时版本、独立 tag 和可恢复发布，不改变正式发布状态。

- Add the react-vite application template with React, TypeScript, Vite, interaction tests, shared linting and workspace library consumption. Include it in initial workspace selection and the Web App creation flow.

  Keep generated lint, test and CI commands independent of source repository build and check scripts.

- 新增可解释的 affected 校验计划，按 Git 变更和消费者闭包选择任务，保守处理缺失历史与未解析依赖，并兼容预览和执行报告。

- 新增独立的 check 执行报告，保留计划预览兼容性并记录失败、中断和跳过任务。

- Add dependency consistency reports and explicit reviewed fix plans with conflict checks and rollback.

- Export affected checks as deterministic GitHub Actions matrices with dependency builds, safe argument arrays, empty-result handling and bounded sharding.

- Add per-package manifest health diagnostics to doctor, with tolerant discovery and stable file/field locations.

- Add previewable, conflict-aware Playwright capabilities for existing Vue and React Vite applications, including headless interaction tests, CI reports and explicit browser setup.

- 提供可信默认分支上的 repoctl 根资产升级报告与补丁，以及分离校验和写凭据的官方升级 PR 工作流。

- Analyze saved Turbo run summaries with task timings, cache outcomes, digested comparison evidence, and a measured dependency critical path without running tasks or modifying caches.

- Add explicit workspace-local Knip checks with native configuration recommendations, severity-preserving reports and reviewed baselines for incremental unused-code and dependency governance.

- Add a Next.js App Router template with server and client components, a health route, generated route type checks, Turbo cache boundaries and packaged production browser acceptance.

  Keep Next.js in the shared template catalog, interactive application choices and literal template path API so discovery, previews and creation resolve the same definition.

- Upgrade explicitly selected template instances with retained three-way baselines, persistent unmanaged paths, conflict previews, atomic registry updates and recoverable file transactions.

- 支持固定版本的组织预设 npm 包，以纯 JSON 组合配置、模板、能力建议和有独立归属记录的工程资产。配置检查显示分层来源，资产应用提供只读计划、三方合并、冲突检查和事务回滚。

  组织预设精确依赖升级可接入维护 PR 工作流：仅合并已有归属文件，发布阶段按工作流固定策略、提交中的包版本及基线 hash 独立校验，兼容既有 repoctl 维护报告。

  组织预设维护的公共元数据缓存仅用于源码验收，生成项目会排除该工具依赖及相关测试脚本。

- Add read-only peer compatibility reports using development declarations, pnpm catalogs, workspace versions, and supported lockfile evidence.

- Add an opt-in pnpm workspace Dev Container preset with reviewed previews, protected existing configurations, pinned Node/Corepack setup and non-root dependency caching.

- Add package check CLI and API to build, inspect actual publish tarballs with publint and ATTW, and validate isolated runtime and TypeScript consumers before release.

- Diagnose registered template versions, trustworthy root asset baselines and managed file drift independently, with offline defaults, explicit remote evidence, strict reports and reasoned doctor suppressions.

- 支持自定义正式发布分支与维护版本线，统一原生版本计划、发布 PR、npm 标签、受管 CI 和原提交恢复的分支映射，并在消费 intent 前检查维护范围。

- Preview and apply safe workspace moves and package renames with dependency aliases, TypeScript path updates, located manual source review, stale-input checks and coordinated file/directory recovery.

  Move registered template instance targets in the same transaction while preserving business edits, source identity, generation parameters and retained baselines for future drift checks and upgrades.

  Allocate independent IDs when a generated project reuses a moved instance's original path, and report committed moves accurately when registry lock cleanup needs attention.

- Preview and apply safe removal of one workspace package with consumer dependency plans, stale-input checks, bounded reference review, coordinated directory/manifest recovery, and operation locks covering replay checks through rollback and cleanup.

- Add a read-only environment and Turbo cache declaration check with static source evidence, input coverage and reasoned suppressions.

- 新增 TypeScript project references 的只读检查、显式受管同步与可审阅事务计划，保留手工引用和原有编译入口。

- Register exact template origins and original/rendered baselines after successful creation. Add read-only instance inventory, explicit historical linking with difference previews, guarded relocation and offline baseline reconstruction. Keep instance provenance separate from managed root assets and never execute historical template scripts.

- Add complete read-only upgrade plans with per-file diffs, guarded application and recoverable migrations.

- Add a read-only native pnpm release plan with version reasons, release-note previews, and JSON output before change intents are consumed.

- Add workspace owner queries and explicit CODEOWNERS previews with conflict-checked, atomic managed-block synchronization.

- Unify built-in and custom template discovery across creation, interactive choices, list/detail output and read-only health checks. Resolve template roots relative to the configuration file and report overrides and invalid declarations with configuration locations.

- Inspect pnpm default and named catalogs and migrate reviewed compatible dependency cohorts with coordinated YAML/manifest previews, conflict checks and transactional recovery.

- Share typed template parameters between interactive and JSON inputs, preview conditional files and package entries, and keep sensitive values out of generation reports and provenance.

  Verify historical parameter contracts before linking, reject secret values and unavailable sources, and retain validated nonsensitive defaults for later upgrades.

  参数化创建在工作区移动后可复用原路径，为新实例分配独立 ID，保持敏感文件排除与事务回滚，并支持两份实例各自漂移检查和升级。

- Discover workspace task scripts and locate packages with explicit ambiguity handling and machine-readable output.

- Doctor 支持精确规则选择、有理由和到期日的抑制，以及只补缺失根脚本的可审核修复计划。

- Preview and prepare isolated Turbo prune build contexts and pinned pnpm deploy production directories with source fingerprints, private-file exclusions, exclusive output publication and recovery.

### Patch Changes

- Keep template parameter values and prompt callbacks in individual creation calls instead of exposing them in project configuration types. Preserve the creation API and CLI parameter inputs while aligning configuration declarations with strict runtime validation.

- Validate doctor configuration through the shared runtime schema and explain workspace-root policy consistently from package directories. Preserve omitted rule selection as all rules and explicit empty selection as none, while validating the full configuration before executing selected doctor checks.

- 使用 bigint 保留文件事务的完整设备与 inode 身份，避免大文件 ID 的数值舍入使失败清理误删其他写入者替换的目录、备份或输出文件。

- Preserve exact filesystem identities and nanosecond freshness checks when inspecting workspaces, so large device or file IDs cannot hide concurrent replacements. Keep inventory reports JSON-compatible.

- Validate installation security expectations through the shared configuration contract while preserving explicit zero release age and build approval policies.

- Preserve snapshot planning's configuration independence through the CLI: do not load or execute repoctl configuration for release snapshot, while ordinary release commands retain strict preflight validation.

- Preserve automatic maintenance of recognized Changesets migrations while authorizing only the exact reviewed migration ledger. Share the completed-history and journal contract between preparation and the isolated publisher, derive its fixed identity and path policy from the built-in registry, and bind migration outputs to verified Git blobs before obtaining write credentials. Interrupted journals still require an explicit manual upgrade.

- Add optional isolated Storybook workspaces with reviewed plans, Vue/React state stories, headless play tests, static builds and unchanged library publication contents.

- 修复 pre-push 使用固定源码目录导致新工作区漏测：按 pnpm 清单动态发现私有和嵌套工作区，保留显式覆盖，并校验删除及跨包重命名的两侧文件。同步中英文校验文档，并兼容 Windows 的 pnpm 命令包装器。

- 组织预设先验证引用，再查找工作区；空引用和非法输入不再访问文件系统，避免未启用预设的配置读取触发无关路径解析。

- Limit workspace clean to selected packages, preview dependency changes, and reject unsafe paths before deletion.

- 统一根包与私有包的发布 intent 识别和版本预览边界，仅对可发布包校验发布说明；通过已提交账本与第一父提交历史定位首次发布来源，并严格校验恢复时 changelog 的存在性。

- Explain retained template origins when removing a generated workspace package, and identify the owning instance when its reserved path prevents a new project from being created.

- Keep pnpm installation security available through the doctor rule registry, reasoned suppressions and the dedicated security subcommand.

- Share reviewed file transactions across tooling operations and retain recovery backups when earlier outputs change during a later write.

- Return structured configuration diagnostics from template inspection after runtime validation, preserve fail-before-write creation, and use one escaped field-path format.

- Add read-only pnpm installation security diagnostics, version-aware organization expectations, and reviewed additive presets with conflict detection and recovery.

- 模板作者验证支持类型化参数矩阵，按条件渲染后的文件与脚本执行独立验收，检测条件依赖遗漏，并保护计划和报告中的敏感参数。

- Updated dependencies:
  - @icebreakers/monorepo@5.7.0

## 5.6.0

### Minor Changes

- 新增中英双语 Nimbus 文档模板，作为 Docs Site 的默认选择；保留 VitePress，补齐 Astro/MDX 校验与模板分发。

### Patch Changes

- Updated dependencies:
  - @icebreakers/monorepo@5.6.0

## 5.5.10

### Patch Changes

- Updated dependencies:
  - @icebreakers/monorepo@5.5.10

## 5.5.9

### Patch Changes

- 修复发布中断后跨 runner 丢失 GitHub 元数据和后置 hook 的问题，增加版本来源校验、远端阶段检查点及幂等恢复保护。

- Updated dependencies:
  - @icebreakers/monorepo@5.5.9

## 5.5.8

### Patch Changes

- Updated dependencies:
  - @icebreakers/monorepo@5.5.8

## 5.5.7

### Patch Changes

- Preserve partial npm publish progress across retries, confirm registry visibility without re-uploading accepted versions, and retain release diagnostics as CI artifacts. Fixes #912.

- Updated dependencies:
  - @icebreakers/monorepo@5.5.7

## 5.5.6

### Patch Changes

- Updated dependencies:
  - @icebreakers/monorepo@5.5.6

## 5.5.5

### Patch Changes

- Update repository links for the move to the icelib GitHub organization and migrate the release workflow to npm trusted publishing. Package names and public APIs are unchanged.

- Updated dependencies:
  - @icebreakers/monorepo@5.5.5

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
