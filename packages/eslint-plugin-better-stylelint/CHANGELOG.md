# eslint-plugin-better-stylelint

## 2.1.1

### Patch Changes

- Update repository links for the move to the icelib GitHub organization and migrate the release workflow to npm trusted publishing. Package names and public APIs are unchanged.

## 2.1.0

### Minor Changes

- Require Node.js 22.13 or newer and normalize package metadata.

### Patch Changes

- Use a pnpm catalog for duplicated package versions without copying catalog specifiers into generated workspaces.

- Drop unused root toolchain leftovers and declare defu and UnoCSS ESLint plugins on the packages that actually use them.

## 2.0.5

### Patch Changes

- chore(deps): update all non-major dependencies (#874)

## 2.0.4

### Patch Changes

- 统一所有公开包的 repoctl 仓库、文档、问题反馈和 npm 首页元数据，移除旧的 dev-configs 标识，并同步双语 README 的项目链接。

- Move the shared development configuration packages into the repoctl workspace while preserving their package names and public exports.

## 2.0.3

### Patch Changes

- 迁移到基于 pnpm 原生版本意图和 repoctl 的统一发版流程，并同步升级已验证兼容的工程依赖。

## 2.0.2

### Patch Changes

- 🐛 **升级运行时与开发依赖，让 Markdown 格式化结果与新版格式器保持一致，并修复 utility 规则把 `table-and-form` 等语义类名误判为 Tailwind/UnoCSS 原子类的问题。** [`bafe948`](https://github.com/sonofmagic/dev-configs/commit/bafe9482c00d11c8e93d4417ced26dc0d36a5fc6) by @sonofmagic

## 2.0.1

### Patch Changes

- 🐛 **Fix CI typecheck compatibility with ESLint 10.6, declare the direct PostCSS dependency used by the Tailwind stylelint plugin, and keep Tailwind runtime and type tests resolvable.** [`e3bf5c6`](https://github.com/sonofmagic/dev-configs/commit/e3bf5c684bcc85cd35cb3826341f4a9c0975cbba) by @sonofmagic

## 2.0.0

### Major Changes

- 🚀 **最低运行环境升级为 Node 22.12.0，发布校验不再覆盖 Node 20。** [`a759944`](https://github.com/sonofmagic/dev-configs/commit/a759944d539f3b6871430b6e951962965e03b493)

### Patch Changes

- 🐛 **deps: upgrade** [`cb7a75f`](https://github.com/sonofmagic/dev-configs/commit/cb7a75f40a086863586c3d4d99c0171e4072b2c6)

## 1.0.5

### Patch Changes

- 🐛 **deps: upgrade** [`8200462`](https://github.com/sonofmagic/dev-configs/commit/82004621320d9655103f3457de8ac32e128d0fee) by @sonofmagic

## 1.0.4

### Patch Changes

- 🐛 **调整 ESLint 与 Stylelint 预设的 peer 依赖归属：由源配置包补齐运行时 preset 链路需要的依赖，避免 repoctl 或 monorepo 为内部实现声明额外依赖。** [`b71c82f`](https://github.com/sonofmagic/dev-configs/commit/b71c82fec930b1cf7f0bbf022095004fd0dc777d) by @sonofmagic
  - React 核心 lint 插件仍随 `@icebreakers/eslint-config` 分发；`eslint-plugin-jsx-a11y` 与 `eslint-plugin-vuejs-accessibility` 改为无障碍预设的按需插件，缺失时继续自动跳过。

## 1.0.3

### Patch Changes

- 🐛 **deps: upgrade** [`eaefeee`](https://github.com/sonofmagic/dev-configs/commit/eaefeee2174b6221dc6e31a3383f967896ab628f) by @sonofmagic

## 1.0.2

### Patch Changes

- 🐛 **deps: upgrade** [`f652a19`](https://github.com/sonofmagic/dev-configs/commit/f652a19ca5160a64f27ac5edc4533e7ed151444d) by @sonofmagic

## 1.0.1

### Patch Changes

- 🐛 **Refresh package dependencies across the linting toolchain and update the** [`9a44d9b`](https://github.com/sonofmagic/dev-configs/commit/9a44d9bdb0cd42ce67376446eb0dfd2a095d2698) by @sonofmagic
  - ESLint integration test to remain compatible with the latest Stylelint
  - diagnostic wording.

## 1.0.0

### Major Changes

- 🚀 **Raise the minimum supported Node.js versions to `^20.19.0 || >=22.12.0`** [`92b869f`](https://github.com/sonofmagic/dev-configs/commit/92b869fb95ad99a1c7f5f970c675cfa79b8b9a31) by @sonofmagic
  - across all published packages so the supported runtime range matches the
  - default `require(esm)` behavior.
  - Also fix `@icebreakers/eslint-config` so ESLint config loading works on
  - Node.js `20.19.0` by polyfilling `Object.groupBy` when the runtime does not
  - provide it yet. This unblocks `pnpm lint` and test execution for the Node 20
  - CI job.

## 0.1.3

### Patch Changes

- 🐛 **Fix the Windows worker bootstrap so the `tsx/esm` loader is passed to** [`69db5c8`](https://github.com/sonofmagic/dev-configs/commit/69db5c87a842d26cedac9256000afa24f8711bc4) by @sonofmagic
  - `node --import` as a `file://` URL, which restores test runs on Node.js 20+
  - and newer GitHub Actions runners.

## 0.1.2

### Patch Changes

- 🐛 **Fix the source-mode Stylelint worker bootstrap on Windows so Node.js 20 can** [`455b711`](https://github.com/sonofmagic/dev-configs/commit/455b711a080cbfd19dd4b56db1edae5d5197b143) by @sonofmagic
  - start the TypeScript worker through the `tsx` ESM loader using a `file://`
  - entry URL.

- 🐛 **Fix the Stylelint worker bootstrap in source-mode test runs so Node.js 20 can** [`eeb599d`](https://github.com/sonofmagic/dev-configs/commit/eeb599d1d372bce17149ff7d77c8923d2b7d7d9f) by @sonofmagic
  - execute the TypeScript worker through the `tsx` ESM loader instead of failing on
  - the raw `.ts` entry file.

## 0.1.1

### Patch Changes

- 🐛 **Make the ESLint Stylelint bridge configurable without coupling the bridge plugin** [`e20b401`](https://github.com/sonofmagic/dev-configs/commit/e20b40187b9a3f9a1d737e94d9361469394827d9) by @sonofmagic
  to the bundled Icebreaker preset.

  For `@icebreakers/eslint-config`:
  - bundle the Stylelint bridge and `@icebreakers/stylelint-config` by default
  - keep `stylelint` disabled by default
  - allow inline Stylelint preset options inside `eslint.config.js`
  - expose an internal `./stylelint` loader entry used by the bridge

  For `eslint-plugin-better-stylelint`:
  - accept external `configLoader` and `configOptions` instead of importing the
    Icebreaker Stylelint preset directly
  - run Stylelint in a short-lived sync subprocess to avoid lingering test
    handles and worker lifecycle issues

- 🐛 **upgrade stylelint to 17.5.0** [`2111052`](https://github.com/sonofmagic/dev-configs/commit/2111052299626ee456f9a0ca897e764d81f2ec99) by @sonofmagic

## 0.1.0

### Minor Changes

- ✨ **Add a new `eslint-plugin-better-stylelint` package that bridges Stylelint** [`1568782`](https://github.com/sonofmagic/dev-configs/commit/15687824f2f0d8004da1d6d035dc96e370c639c1) by @sonofmagic
  diagnostics into ESLint.

  The new package provides:
  - `stylelint/css` processor for CSS-like files
  - `stylelint/scss` processor for SCSS-like files
  - `stylelint/stylelint` rule for Vue SFC files

  The bridge now runs Stylelint through a bundled `synckit` worker instead of
  shelling out to the Stylelint CLI, while still preferring the consuming
  project's own `stylelint` installation when present.

  For Vue SFCs, the rule lints each `<style>` block separately, preserves
  block-specific context such as `scoped`, `module`, and `lang`, and maps the
  reported locations back to the original `.vue` file.

  Also add a `stylelint` option to `@icebreakers/eslint-config` so consumers can
  opt into the bridge directly from the preset.
