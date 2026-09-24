# postcss-tailwindcss

## 3.1.2

### Patch Changes

- Update repository links for the move to the icelib GitHub organization and migrate the release workflow to npm trusted publishing. Package names and public APIs are unchanged.

## 3.1.1

### Patch Changes

- chore(deps): update all non-major dependencies (#898)

## 3.1.0

### Minor Changes

- Require Node.js 22.13 or newer and normalize package metadata.

### Patch Changes

- Use a pnpm catalog for duplicated package versions without copying catalog specifiers into generated workspaces.

## 3.0.8

### Patch Changes

- chore(deps): update pnpm-workspace.overrides postcss to v8.5.28 (#866)

- Update dependency compatibility and the related linting packages. (#867)

## 3.0.7

### Patch Changes

- 统一所有公开包的 repoctl 仓库、文档、问题反馈和 npm 首页元数据，移除旧的 dev-configs 标识，并同步双语 README 的项目链接。

- Move the shared development configuration packages into the repoctl workspace while preserving their package names and public exports.

## 3.0.6

### Patch Changes

- 升级除 TypeScript 外的直接依赖，并在 `@icebreakers/eslint-config` 中内置 `@weapp-vite/eslint`，让 `miniProgram: true` 自动启用 Wevu 兼容性检查，提前报告不支持或语义有差异的 Vue、Pinia 与 Vue Router API。

## 3.0.5

### Patch Changes

- 迁移到基于 pnpm 原生版本意图和 repoctl 的统一发版流程，并同步升级已验证兼容的工程依赖。

## 3.0.4

### Patch Changes

- 🐛 **升级除 TypeScript 外的运行时与开发依赖，并适配 Changesets 3 的 GitHub 信息接口，保持变更日志中的提交、拉取请求和作者链接输出不变。** [#282](https://github.com/sonofmagic/dev-configs/pull/282) by @sonofmagic

## 3.0.3

### Patch Changes

- 🐛 **升级运行时与开发依赖，让 Markdown 格式化结果与新版格式器保持一致，并修复 utility 规则把 `table-and-form` 等语义类名误判为 Tailwind/UnoCSS 原子类的问题。** [`bafe948`](https://github.com/sonofmagic/dev-configs/commit/bafe9482c00d11c8e93d4417ced26dc0d36a5fc6) by @sonofmagic

## 3.0.2

### Patch Changes

- 🐛 **Fix CI typecheck compatibility with ESLint 10.6, declare the direct PostCSS dependency used by the Tailwind stylelint plugin, and keep Tailwind runtime and type tests resolvable.** [`e3bf5c6`](https://github.com/sonofmagic/dev-configs/commit/e3bf5c684bcc85cd35cb3826341f4a9c0975cbba) by @sonofmagic

## 3.0.1

### Patch Changes

- 🐛 **Upgrade linting runtime dependencies and keep the Tailwind CSS ESLint preset** [`b2d1012`](https://github.com/sonofmagic/dev-configs/commit/b2d1012639aeae3253a6ee0d2ac612dce14e593e) by @sonofmagic
  - usable with eslint-plugin-tailwindcss v4 by providing a resolvable default CSS
  - config path.

## 3.0.0

### Major Changes

- 🚀 **最低运行环境升级为 Node 22.12.0，发布校验不再覆盖 Node 20。** [`a759944`](https://github.com/sonofmagic/dev-configs/commit/a759944d539f3b6871430b6e951962965e03b493)

### Patch Changes

- 🐛 **deps: upgrade** [`cb7a75f`](https://github.com/sonofmagic/dev-configs/commit/cb7a75f40a086863586c3d4d99c0171e4072b2c6)

## 2.0.6

### Patch Changes

- 🐛 **deps: upgrade** [`8200462`](https://github.com/sonofmagic/dev-configs/commit/82004621320d9655103f3457de8ac32e128d0fee) by @sonofmagic

## 2.0.5

### Patch Changes

- 🐛 **deps: upgrade** [`d894675`](https://github.com/sonofmagic/dev-configs/commit/d8946750693f119abdb0ec6863660c651d85bf93) by @sonofmagic

## 2.0.4

### Patch Changes

- 🐛 **deps: upgrade** [`7cc41ca`](https://github.com/sonofmagic/dev-configs/commit/7cc41caca95921bf7e59d1cc352c4504cbee30aa) by @sonofmagic

## 2.0.3

### Patch Changes

- 🐛 **deps: upgrade** [`eaefeee`](https://github.com/sonofmagic/dev-configs/commit/eaefeee2174b6221dc6e31a3383f967896ab628f) by @sonofmagic

## 2.0.2

### Patch Changes

- 🐛 **deps: upgrade** [`f652a19`](https://github.com/sonofmagic/dev-configs/commit/f652a19ca5160a64f27ac5edc4533e7ed151444d) by @sonofmagic

## 2.0.1

### Patch Changes

- 🐛 **deps: upgrade** [`70dc018`](https://github.com/sonofmagic/dev-configs/commit/70dc01865748ba0aa9ec558e0ea11821e7f2f6cd) by @sonofmagic

## 2.0.0

### Major Changes

- 🚀 **Raise the minimum supported Node.js versions to `^20.19.0 || >=22.12.0`** [`92b869f`](https://github.com/sonofmagic/dev-configs/commit/92b869fb95ad99a1c7f5f970c675cfa79b8b9a31) by @sonofmagic
  - across all published packages so the supported runtime range matches the
  - default `require(esm)` behavior.
  - Also fix `@icebreakers/eslint-config` so ESLint config loading works on
  - Node.js `20.19.0` by polyfilling `Object.groupBy` when the runtime does not
  - provide it yet. This unblocks `pnpm lint` and test execution for the Node 20
  - CI job.

## 1.0.1

### Patch Changes

- 🐛 **Update package dependencies to latest compatible versions.** [`5cca66e`](https://github.com/sonofmagic/dev-configs/commit/5cca66e5245a59cb11bbc6dbaefd87315f801397) by @sonofmagic

## 1.0.0

### Major Changes

- 🚀 **Expand the Tailwind and utility-first analysis surface with new theme and** [`14fc833`](https://github.com/sonofmagic/dev-configs/commit/14fc833fb2d801b87313eae1e1340375f510d8da) by @sonofmagic
  directive policy support.

  For `stylelint-plugin-tailwindcss`, this release adds new exported rules and
  recommended defaults for:
  - `tailwindcss/no-theme-function`
  - `tailwindcss/no-invalid-theme-function`
  - `tailwindcss/no-screen-directive`
  - `tailwindcss/no-css-layer`
  - `unocss/no-variant-group`

  This is marked as a major release because the default `recommended`
  configuration now enables additional rules beyond the previous set.

  For `postcss-tailwindcss`, this release is marked major to align with the new
  theme and directive analysis expectations consumed by downstream tooling.

## 0.0.2

### Patch Changes

- 🐛 **deps: upgrade** [`1823e9c`](https://github.com/sonofmagic/dev-configs/commit/1823e9c51aec4aaccaa03697267e67c16d27be71) by @sonofmagic

## 0.0.1

### Patch Changes

- 🐛 **Add Tailwind CSS analysis utility packages for PostCSS AST and Lightning CSS AST.** [`3847047`](https://github.com/sonofmagic/dev-configs/commit/38470476b5ceb034bd6661f653a8f9a889f660ea) by @sonofmagic
  - Update `stylelint-plugin-tailwindcss` to reuse the PostCSS-based selector collection helpers.

- 🐛 **Refine Tailwind runtime resolution to use lightweight tsconfig path matching** [`2db073b`](https://github.com/sonofmagic/dev-configs/commit/2db073ba0ee118e72cd8a726930e91d75ec1fb9c) by @sonofmagic
  - via `get-tsconfig` instead of `tsconfig-paths-webpack-plugin`.
  - Update `stylelint-plugin-tailwindcss` to resolve Tailwind CSS from the
  - consumer project at runtime, instead of bundling version-specific Tailwind
  - implementations inside the plugin package.

- 🐛 **Migrate all packages under `packages/` to build with `tsdown`.** [`45c73ca`](https://github.com/sonofmagic/dev-configs/commit/45c73ca9f70ba813052c9970b54e08d853e638ce) by @sonofmagic
  - This removes the remaining `tsup` and `unbuild` package-level build configs,
  - switches package scripts to `tsdown`, and keeps the package outputs aligned with
  - the existing published entry points.
