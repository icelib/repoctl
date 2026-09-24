# @icebreakers/stylelint-config

## 5.1.2

### Patch Changes

- Update repository links for the move to the icelib GitHub organization and migrate the release workflow to npm trusted publishing. Package names and public APIs are unchanged.

- Updated dependencies:
  - stylelint-plugin-tailwindcss@3.1.2

## 5.1.1

### Patch Changes

- Updated dependencies:
  - stylelint-plugin-tailwindcss@3.1.1

## 5.1.0

### Minor Changes

- Require Node.js 22.13 or newer and normalize package metadata.

### Patch Changes

- Use a pnpm catalog for duplicated package versions without copying catalog specifiers into generated workspaces.

- Updated dependencies:
  - stylelint-plugin-tailwindcss@3.1.0

## 5.0.9

### Patch Changes

- Updated dependencies:
  - stylelint-plugin-tailwindcss@3.0.9

## 5.0.8

### Patch Changes

- Updated dependencies:
  - stylelint-plugin-tailwindcss@3.0.8

## 5.0.7

### Patch Changes

- 统一所有公开包的 repoctl 仓库、文档、问题反馈和 npm 首页元数据，移除旧的 dev-configs 标识，并同步双语 README 的项目链接。

- Move the shared development configuration packages into the repoctl workspace while preserving their package names and public exports.

- Updated dependencies:
  - stylelint-plugin-tailwindcss@3.0.7

## 5.0.6

### Patch Changes

- Updated dependencies:
  - stylelint-plugin-tailwindcss@3.0.6

## 5.0.5

### Patch Changes

- 迁移到基于 pnpm 原生版本意图和 repoctl 的统一发版流程，并同步升级已验证兼容的工程依赖。

- Updated dependencies:
  - stylelint-plugin-tailwindcss@3.0.5

## 5.0.4

### Patch Changes

- 🐛 **升级除 TypeScript 外的运行时与开发依赖，并适配 Changesets 3 的 GitHub 信息接口，保持变更日志中的提交、拉取请求和作者链接输出不变。** [#282](https://github.com/sonofmagic/dev-configs/pull/282) by @sonofmagic
- 📦 **Dependencies** [`e4ea8c1`](https://github.com/sonofmagic/dev-configs/commit/e4ea8c1b1c63f190ea4e391ac8b711e6aa3f7e12)
  → `stylelint-plugin-tailwindcss@3.0.4`

## 5.0.3

### Patch Changes

- 🐛 **升级运行时与开发依赖，让 Markdown 格式化结果与新版格式器保持一致，并修复 utility 规则把 `table-and-form` 等语义类名误判为 Tailwind/UnoCSS 原子类的问题。** [`bafe948`](https://github.com/sonofmagic/dev-configs/commit/bafe9482c00d11c8e93d4417ced26dc0d36a5fc6) by @sonofmagic
- 📦 **Dependencies** [`bafe948`](https://github.com/sonofmagic/dev-configs/commit/bafe9482c00d11c8e93d4417ced26dc0d36a5fc6)
  → `stylelint-plugin-tailwindcss@3.0.3`

## 5.0.2

### Patch Changes

- 🐛 **Fix CI typecheck compatibility with ESLint 10.6, declare the direct PostCSS dependency used by the Tailwind stylelint plugin, and keep Tailwind runtime and type tests resolvable.** [`e3bf5c6`](https://github.com/sonofmagic/dev-configs/commit/e3bf5c684bcc85cd35cb3826341f4a9c0975cbba) by @sonofmagic
- 📦 **Dependencies** [`e3bf5c6`](https://github.com/sonofmagic/dev-configs/commit/e3bf5c684bcc85cd35cb3826341f4a9c0975cbba)
  → `stylelint-plugin-tailwindcss@3.0.2`

## 5.0.1

### Patch Changes

- 📦 **Dependencies**
  → `stylelint-plugin-tailwindcss@3.0.1`

## 5.0.0

### Major Changes

- 🚀 **最低运行环境升级为 Node 22.12.0，发布校验不再覆盖 Node 20。** [`a759944`](https://github.com/sonofmagic/dev-configs/commit/a759944d539f3b6871430b6e951962965e03b493)

### Patch Changes

- 📦 **Dependencies** [`a759944`](https://github.com/sonofmagic/dev-configs/commit/a759944d539f3b6871430b6e951962965e03b493)
  → `stylelint-plugin-tailwindcss@3.0.0`

## 4.0.2

### Patch Changes

- 📦 **Dependencies**
  → `stylelint-plugin-tailwindcss@2.0.6`

## 4.0.1

### Patch Changes

- 📦 **Dependencies**
  → `stylelint-plugin-tailwindcss@2.0.5`

## 4.0.0

### Major Changes

- 🚀 **deps: upgrade** [`7cc41ca`](https://github.com/sonofmagic/dev-configs/commit/7cc41caca95921bf7e59d1cc352c4504cbee30aa) by @sonofmagic

### Patch Changes

- 📦 **Dependencies**
  → `stylelint-plugin-tailwindcss@2.0.4`

## 3.0.7

### Patch Changes

- 🐛 **调整 ESLint 与 Stylelint 预设的 peer 依赖归属：由源配置包补齐运行时 preset 链路需要的依赖，避免 repoctl 或 monorepo 为内部实现声明额外依赖。** [`b71c82f`](https://github.com/sonofmagic/dev-configs/commit/b71c82fec930b1cf7f0bbf022095004fd0dc777d) by @sonofmagic
  - React 核心 lint 插件仍随 `@icebreakers/eslint-config` 分发；`eslint-plugin-jsx-a11y` 与 `eslint-plugin-vuejs-accessibility` 改为无障碍预设的按需插件，缺失时继续自动跳过。

## 3.0.6

### Patch Changes

- 🐛 **deps: upgrade** [`eaefeee`](https://github.com/sonofmagic/dev-configs/commit/eaefeee2174b6221dc6e31a3383f967896ab628f) by @sonofmagic

- 🐛 **Downgrade `property-no-vendor-prefix` to a warning by default and disable it for Mini Program configs.** [`8f14d4f`](https://github.com/sonofmagic/dev-configs/commit/8f14d4fcc5b8445a494f8ec4a68daed032dde218) by @sonofmagic
- 📦 **Dependencies**
  → `stylelint-plugin-tailwindcss@2.0.3`

## 3.0.5

### Patch Changes

- 📦 **Dependencies**
  → `stylelint-plugin-tailwindcss@2.0.2`

## 3.0.4

### Patch Changes

- 🐛 **Refresh package dependencies across the linting toolchain and update the** [`9a44d9b`](https://github.com/sonofmagic/dev-configs/commit/9a44d9bdb0cd42ce67376446eb0dfd2a095d2698) by @sonofmagic
  - ESLint integration test to remain compatible with the latest Stylelint
  - diagnostic wording.

## 3.0.3

### Patch Changes

- 🐛 **deps: upgrade** [`8cad8e7`](https://github.com/sonofmagic/dev-configs/commit/8cad8e791ae9cc6e7286b38b3b3f1e7c71cd8569) by @sonofmagic

## 3.0.2

### Patch Changes

- 📦 **Dependencies**
  → `stylelint-plugin-tailwindcss@2.0.1`

## 3.0.1

### Patch Changes

- 🐛 **lint: shift style formatting ownership to stylelint** [`4b14479`](https://github.com/sonofmagic/dev-configs/commit/4b1447914aa34716d5ddf34af02622c170b8150e) by @sonofmagic
  - stop enabling CSS-family formatter rules by default in `@icebreakers/eslint-config`
  - document separate ESLint and Stylelint fix flows for consumers
  - add a safe fix-oriented formatting preset to `@icebreakers/stylelint-config`

## 3.0.0

### Major Changes

- 🚀 **Raise the minimum supported Node.js versions to `^20.19.0 || >=22.12.0`** [`92b869f`](https://github.com/sonofmagic/dev-configs/commit/92b869fb95ad99a1c7f5f970c675cfa79b8b9a31) by @sonofmagic
  - across all published packages so the supported runtime range matches the
  - default `require(esm)` behavior.
  - Also fix `@icebreakers/eslint-config` so ESLint config loading works on
  - Node.js `20.19.0` by polyfilling `Object.groupBy` when the runtime does not
  - provide it yet. This unblocks `pnpm lint` and test execution for the Node 20
  - CI job.

### Patch Changes

- 📦 **Dependencies** [`92b869f`](https://github.com/sonofmagic/dev-configs/commit/92b869fb95ad99a1c7f5f970c675cfa79b8b9a31)
  → `stylelint-plugin-tailwindcss@2.0.0`

## 2.2.1

### Patch Changes

- 🐛 **Make React, Next, and TanStack Query ESLint plugins optional so the preset can still resolve in Node 20 environments when those plugins are not installed. Also fix the bundled Stylelint config typings so package typecheck passes again.** [`fc8b49d`](https://github.com/sonofmagic/dev-configs/commit/fc8b49dfcf010c3351730301dfc31c9b786dfca4) by @sonofmagic
- 📦 **Dependencies** [`fc8b49d`](https://github.com/sonofmagic/dev-configs/commit/fc8b49dfcf010c3351730301dfc31c9b786dfca4)
  → `stylelint-plugin-tailwindcss@1.0.2`

## 2.2.0

### Minor Changes

- ✨ **Add first-class Mini Program presets for ESLint and Stylelint.** [`58fb7d2`](https://github.com/sonofmagic/dev-configs/commit/58fb7d20acc9c196432523a48c7571b4ddccd912) by @sonofmagic
  - For `@icebreakers/eslint-config`, this introduces the recommended `miniProgram: true`
  - option, keeps `weapp` as a backwards-compatible alias, injects common Mini Program
  - globals, ignores common Mini Program build/config outputs, and improves Vue SFC
  - compatibility for Mini Program templates.
  - For `@icebreakers/stylelint-config`, this introduces `miniProgram: true` support,
  - adds default ignore paths for Mini Program build outputs, and documents the minimal
  - setup for native Mini Program and `weapp-vite` / `wevu` templates.

## 2.1.2

### Patch Changes

- 📦 **Dependencies**
  → `stylelint-plugin-tailwindcss@1.0.1`

## 2.1.1

### Patch Changes

- 🐛 **Export explicit public config result types for the `icebreaker` factory helpers.** [`7cc614e`](https://github.com/sonofmagic/dev-configs/commit/7cc614ef85ca028297673da1d8c333c4d8b4bbbf) by @sonofmagic
  - Also expose the Stylelint config input types from the package entry so consumers
  - can reference both input and output config types directly.

## 2.1.0

### Minor Changes

- ✨ **Split the utility-first rules into `tailwindcss/*` and `unocss/*`** [`8730574`](https://github.com/sonofmagic/dev-configs/commit/8730574b5399eb4c06908192ad279293592fe52f) by @sonofmagic
  namespaces.

  Default `base` and `recommended` configs now enable both namespaces,
  while still allowing each rule to be disabled independently.

  Add explicit single-namespace exports for consumers that want one side
  only, including:
  - `tailwindBase`
  - `tailwindRecommended`
  - `unocssBase`
  - `unocssRecommended`
  - `unocssNoAtomicClassPlugin`
  - `unocssNoInvalidApplyPlugin`
  - `unocssNoApplyPlugin`
  - `unocssNoArbitraryValuePlugin`

  Also add the matching `UNOCSS_NO_*` rule-name exports and document how
  to disable either namespace or individual rules one by one.

  Update `@icebreakers/stylelint-config` so its default preset enables
  both the `tailwindcss/*` and `unocss/*` rule sets, and add matching
  mock demo files that isolate each namespace in the IDE.

- ✨ **Refine the utility-policy preset layering for Stylelint packages.** [`7474460`](https://github.com/sonofmagic/dev-configs/commit/7474460f247f773adcee7f580932ba7ed678c63e) by @sonofmagic
  For `stylelint-plugin-tailwindcss`:
  - clarify the built-in `base` and `recommended` tiers
  - add `strict`, `tailwindStrict`, and `unocssStrict`
  - refresh rule docs and README guidance for the new preset boundaries
  - expand the UnoCSS demo examples to show what `unocss/no-invalid-apply`
    reports and what it intentionally ignores

  For `@icebreakers/stylelint-config`:
  - change the default bundled utility-policy layer to the plugin package's
    `base` preset
  - add `tailwindcssPreset: 'base' | 'recommended' | 'strict'`
  - document how to opt into the broader `recommended` layer or the stricter
    architecture-oriented Tailwind layer

### Patch Changes

- 📦 **Dependencies** [`8730574`](https://github.com/sonofmagic/dev-configs/commit/8730574b5399eb4c06908192ad279293592fe52f)
  → `stylelint-plugin-tailwindcss@1.0.0`

## Next

### Patch Changes

- 🐛 **Lower the default bundled `stylelint-plugin-tailwindcss` policy layer to `base` and add an explicit `tailwindcssPreset` option with `base`, `recommended`, and `strict`.**
  - Default configs now only enable the utility selector and invalid `@apply` checks from the plugin package.
  - `createStylelintConfig({ tailwindcssPreset: 'recommended' })` restores the broader everyday rule layer.
  - `createStylelintConfig({ tailwindcssPreset: 'strict' })` enables the stricter architecture-oriented Tailwind rules.
  - Update tests, snapshots, and README docs to match the new default and upgrade paths.

## 2.0.7

### Patch Changes

- 🐛 **Disallow more UnoCSS-style arbitrary value selectors and candidates in the built-in Tailwind utility rules, including bare values such as `w-10px`, `top--10px`, `bg-$brand`, and `[&>*]:w-10px`.** [`5f7f93e`](https://github.com/sonofmagic/dev-configs/commit/5f7f93eb3ba030f61e055a11241bbe7326509857) by @sonofmagic

- 🐛 **Fix editor linting conflicts between ESLint and Stylelint for CSS-like files by removing style languages from generated VS Code ESLint validation settings, and disable the noisy `style/eol-last` ESLint rule in the base preset.** [`546a350`](https://github.com/sonofmagic/dev-configs/commit/546a350daee9d73aa364fd09de5857bb06e5c07d) by @sonofmagic
- 📦 **Dependencies** [`5f7f93e`](https://github.com/sonofmagic/dev-configs/commit/5f7f93eb3ba030f61e055a11241bbe7326509857)
  → `stylelint-plugin-tailwindcss@0.0.3`

## 2.0.6

### Patch Changes

- 📦 **Dependencies**
  → `stylelint-plugin-tailwindcss@0.0.2`

## 2.0.5

### Patch Changes

- 🐛 **Migrate all packages under `packages/` to build with `tsdown`.** [`45c73ca`](https://github.com/sonofmagic/dev-configs/commit/45c73ca9f70ba813052c9970b54e08d853e638ce) by @sonofmagic
  - This removes the remaining `tsup` and `unbuild` package-level build configs,
  - switches package scripts to `tsdown`, and keeps the package outputs aligned with
  - the existing published entry points.

- 🐛 **Add a dedicated Stylelint plugin that blocks authored Tailwind utility selectors** [`7045cc1`](https://github.com/sonofmagic/dev-configs/commit/7045cc1742e8a9101fe2a567f96356482ce7b186) by @sonofmagic
  - and enable it by default in `@icebreakers/stylelint-config`.
  - The new plugin supports both Tailwind CSS v3 and v4 projects by detecting the
  - installed major version at runtime.
- 📦 **Dependencies** [`3847047`](https://github.com/sonofmagic/dev-configs/commit/38470476b5ceb034bd6661f653a8f9a889f660ea)
  → `stylelint-plugin-tailwindcss@0.0.1`

## 2.0.4

### Patch Changes

- 🐛 **Align the default `media-feature-range-notation` rule with Prettier and ESLint formatter output by using prefix media queries such as `max-width`.** [`42eeab4`](https://github.com/sonofmagic/dev-configs/commit/42eeab415269967e4f378d84d3ee2a4b2e3e23ac) by @sonofmagic
  - This avoids formatter conflicts in repositories that run both Stylelint fixes and CSS formatting through ESLint.

## 2.0.3

### Patch Changes

- 🐛 **bump package dependencies for changelog, commitlint, eslint, and stylelint configs.** [`0554cd5`](https://github.com/sonofmagic/dev-configs/commit/0554cd5b3dc3c02e965d579083e7df3f15399332) by @sonofmagic

## 2.0.2

### Patch Changes

- 🐛 **chore(deps): upgrade** [`2ab5b70`](https://github.com/sonofmagic/dev-configs/commit/2ab5b706fd41b17752ed8a013a242a70e6d97e39) by @sonofmagic

## 2.0.1

### Patch Changes

- 🐛 **Fix preset resolution for ESM-only stylelint configs.** [`4b67efc`](https://github.com/sonofmagic/dev-configs/commit/4b67efcc651371e2fd14024454d2478c09cfde0c) by @sonofmagic

## 2.0.0

### Major Changes

- 🚀 **Switch to ESM-only builds and remove CJS exports.** [`227a310`](https://github.com/sonofmagic/dev-configs/commit/227a3100526300876c7c0b44810d04a69a4e2860) by @sonofmagic

## 1.2.6

### Patch Changes

- 🐛 **Improve eslint config option handling and unit coverage.** [`c0e39e3`](https://github.com/sonofmagic/dev-configs/commit/c0e39e3e5c813d7214fd106dabb4818f772a0bd4) by @sonofmagic
  - Harden stylelint preset resolution for ESM-only configs.

## 1.2.5

### Patch Changes

- 🐛 **chore: upgrade** [`461103c`](https://github.com/sonofmagic/dev-configs/commit/461103ce0671ea6fdae12b065c218ae0a4d7e4e5) by @sonofmagic

## 1.2.4

### Patch Changes

- 🐛 **Allow BEM/OOCSS class naming by default via selector-class-pattern and document/test the behavior.** — [`65e9e74`](https://github.com/sonofmagic/dev-configs/commit/65e9e741315315c180e11ea51f9f2a6573d010ea) · Thanks [@sonofmagic](https://github.com/sonofmagic) · Patch release

- 🐛 **chore(deps): upgrade** — [`65e9e74`](https://github.com/sonofmagic/dev-configs/commit/65e9e741315315c180e11ea51f9f2a6573d010ea) · Thanks [@sonofmagic](https://github.com/sonofmagic) · Patch release

## 1.2.3

### Patch Changes

- 🐛 **Disable the `function-name-case` rule so function helpers with uppercase letters pass linting.** — [`149b11e`](https://github.com/sonofmagic/dev-configs/commit/149b11ef108528be84e9afdd5695d53ab849c6ef) · Thanks [@sonofmagic](https://github.com/sonofmagic) · Patch release

## 1.2.2

### Patch Changes

- 🐛 **docs: reflow package READMEs for better rendering** — [`44d4b37`](https://github.com/sonofmagic/dev-configs/commit/44d4b37a47e0a0c327fedce97d3d04ce36425a87) · Thanks [@sonofmagic](https://github.com/sonofmagic) · Patch release

- 🐛 **chore(deps): upgrade** — [`d6e6a5b`](https://github.com/sonofmagic/dev-configs/commit/d6e6a5bd8c3fd0c593dfe3c16402c4e254ee979a) · Thanks [@sonofmagic](https://github.com/sonofmagic) · Patch release

## 1.2.1

### Patch Changes

- [`e9e9faf`](https://github.com/sonofmagic/dev-configs/commit/e9e9faf3c55e368d61330da5d1251758f9bb0f62) Thanks [@sonofmagic](https://github.com/sonofmagic)! - fix: use requireFromConfig.resolve to get config preset

## 1.2.0

### Minor Changes

- [`fe94f59`](https://github.com/sonofmagic/dev-configs/commit/fe94f591a991b38845c1122693ba9e88f610cce9) Thanks [@sonofmagic](https://github.com/sonofmagic)! - - 重构核心配置工厂，新增 `createStylelintConfig` 以支持开关预设、扩展忽略列表并保持 `icebreaker()` 向后兼容
  - 精简 VS Code 初始化逻辑，移除 `get-value`/`set-value` 依赖，保留原有设置输出
  - 更新包导出结构与 README 用法示例，覆盖 CLI、构建产物和文档说明

## 1.1.6

### Patch Changes

- [`5054a5f`](https://github.com/sonofmagic/dev-configs/commit/5054a5fddcffcfa2c3961bdefb5f0f68d4050077) Thanks [@sonofmagic](https://github.com/sonofmagic)! - chore(deps): upgrade

## 1.1.5

### Patch Changes

- [`c201d06`](https://github.com/sonofmagic/dev-configs/commit/c201d06b9e4d001c083f71c7b3819b61219a106c) Thanks [@sonofmagic](https://github.com/sonofmagic)! - chore(deps): upgrade

## 1.1.4

### Patch Changes

- [`ff56985`](https://github.com/sonofmagic/dev-configs/commit/ff5698537710eb3faedbdf6902d47b50f8243cd0) Thanks [@sonofmagic](https://github.com/sonofmagic)! - chore(deps): upgrade

## 1.1.3

### Patch Changes

- [`324a269`](https://github.com/sonofmagic/dev-configs/commit/324a269f66aba1a8c3a6243a8d77900792508ba8) Thanks [@sonofmagic](https://github.com/sonofmagic)! - chore(deps): upgrade

## 1.1.2

### Patch Changes

- [`a939a06`](https://github.com/sonofmagic/dev-configs/commit/a939a06c16c831fe56f1ebf46da6421e6ab56ba1) Thanks [@sonofmagic](https://github.com/sonofmagic)! - chore: bump version

## 1.1.1

### Patch Changes

- [`d3dbad4`](https://github.com/sonofmagic/dev-configs/commit/d3dbad46db6d3a2a8db252072917dda32aeeef8d) Thanks [@sonofmagic](https://github.com/sonofmagic)! - chore: bump version

## 1.1.0

### Minor Changes

- [`cd6f624`](https://github.com/sonofmagic/dev-configs/commit/cd6f624b3ab5c572b8147e8332cfd3786e5a74f2) Thanks [@sonofmagic](https://github.com/sonofmagic)! - chore: bump version

## 1.0.2

### Patch Changes

- [`84e0907`](https://github.com/sonofmagic/dev-configs/commit/84e0907133d66e497e949276c0c8a65f998feaad) Thanks [@sonofmagic](https://github.com/sonofmagic)! - chore: bump version

## 1.0.1

### Patch Changes

- [`0db8f3a`](https://github.com/sonofmagic/dev-configs/commit/0db8f3a871ca7efb797ce6dfdf532aef41ff8776) Thanks [@sonofmagic](https://github.com/sonofmagic)! - chore: bump version

## 1.0.0

### Major Changes

- [`a3a085e`](https://github.com/sonofmagic/dev-configs/commit/a3a085e041267b66e6705d9f982bca213df90da4) Thanks [@sonofmagic](https://github.com/sonofmagic)! - feat: upgrade to latset version

## 0.1.3

### Patch Changes

- [`d59c750`](https://github.com/sonofmagic/dev-configs/commit/d59c75001bef52bbf4cfa3c8f128ca91f2b1b67d) Thanks [@sonofmagic](https://github.com/sonofmagic)! - chore(deps): upgrade
