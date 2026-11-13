# 2026-11-13 依赖升级评估

基于 `origin/main` 的 `f452e4f9`，检查根目录及 24 个子工作区、catalog、定向 overrides 和能力生成器的依赖。升级采用最新稳定版，保留历史教学示例、旧版本兼容测试和既有 peer 支持承诺。

## 采用的更新

| 依赖                              | 更新                                              |
| --------------------------------- | ------------------------------------------------- |
| Prettier                          | 3.10.0 → 3.10.1，同步全局 override                |
| postcss-selector-parser           | 7.2.0 → 7.2.1，同步全局 override                  |
| enhanced-resolve                  | 5.26.1 → 5.27.0                                   |
| stylelint-config-recommended-scss | 17.0.1 → 18.0.0                                   |
| stylelint-scss                    | 7.4.0 → 7.5.0                                     |
| vue-i18n                          | 11.4.18 → 11.4.19                                 |
| Cloudflare Vite 插件              | 1.69.0 → 1.69.1                                   |
| Hono Node 服务                    | 2.1.7 → 2.1.8                                     |
| Vue Vite 插件                     | 6.0.10 → 6.0.11，同步 Storybook 生成器            |
| jsdom                             | 31.0.0 → 31.0.1                                   |
| Nimbus                            | 0.19.4 → 0.20.0                                   |
| Wrangler                          | 4.160.1 → 4.161.0                                 |
| glob 定向 override                | 14.0.5 → 14.0.6，保留 `<14` 作用范围              |
| UnoCSS config/core/ESLint 插件    | 66.12.0 → 66.13.0，纳入执行期间复查发现的新稳定版 |
| Dev Container 回归 CLI            | 0.89.0 → 0.90.0，同步测试脚本中的两处精确版本     |

快照工作流的 API 与 CLI 默认 pnpm 同步为 12.18.0，CLI 复用同一默认值；显式指定其他受支持的 pnpm 12 版本仍然有效。中英文文档和内置技能中的命令示例同步更新。

glob 的 `<14` 定向 override 保持原作用范围；npm 工具链原生 `^14.0.3` 依赖也通过 pnpm 定向更新统一解析到 14.0.6，锁文件不再保留 14.0.5。没有扩大 override，也没有修改上游依赖范围。

## 兼容审阅

- Nimbus 的 dry-run 没有自动源文件迁移。两项必审要求为运行环境最低版本与 agent 路由形状，当前 Node/Astro 基线、Markdown/MDX/LLM 工厂路由和可选 `markdownUrl` 处理均满足要求。先完成审阅，再通过迁移命令记录 0.20.0；具体依据保存在模板的 `UPSTREAM.md`。
- SCSS 插件与推荐配置现已声明支持 Stylelint 18。保留现有预设打包方式、Sass 组合值兼容规则和隔离 tarball 验证，并按实际打包依赖更新第三方许可证。
- 根目录等工作区继续使用 TypeScript 7.0.2；核心编译器 API 与 Vue/Astro 检查器保留 TypeScript 6.0.3，Volar 的 peer 仍要求 `<7`。ESLint 的独立 TypeScript 6 兼容包、ATTW 的 TypeScript 5.9.3 与 WASM 桥接隔离保持不变。
- `c12` 的 latest 为 4.0.0-rc.4，稳定分支仍为 3.3.4；既有 VitePress 2 alpha 不降级。pnpm、Corepack、Vitest、Storybook、Playwright 和有效 GitHub Actions 已为核验时的当前版本。
- 安装后的 peer 报告仍涉及 Volar、Antfu 的 Astro formatter、recess-order 和 tsconfck 的上游范围。保留真实声明，使用独立消费者、类型检查和运行测试验证实际边界。

## 发布与验证

通过 `pnpm change` 为核心引擎、repoctl、模板资产、ESLint、Stylelint、Tailwind Stylelint 插件和 PostCSS 插件记录 patch 意图。锁文件由 pnpm 12.18.0 生成，保留包管理器与工作区两份 YAML 文档。

按 build、lint、typecheck、tsd、完整测试及打包集成/E2E 的顺序完成验证：

- macOS arm64 / Node 24.22.1：最终锁文件的 build、ESLint/Stylelint、typecheck、tsd 和 `pnpm test` 全部通过。主 Vitest 为 519 个测试文件、3,771 项测试通过，另有 2 个文件、22 项既有跳过；发布类型消费者、工作区类型测试、开发场景和文档发布测试也通过。
- macOS arm64 / Node 26.12.1：禁用 Turbo 缓存后，build、lint、typecheck、tsd 和完整测试全部通过。之后进行的 glob 去重已在 Node 24 上重新完成上述检查。
- 16 项 Worker 与打包检查全部通过：Worker、doctor、create、docs、Nimbus、React、Next、Playwright capability、Storybook、React library、template validation、template sources、presets、maintenance presets、generators 和 template parameters。
- SCSS 隔离 tarball 消费者通过严格 peer 安装，覆盖 CSS/SCSS/Vue/WXSS 的有效和无效输入、Sass 变量与组合函数、属性排序自动修复和 ESLint 样式桥接。
- Nimbus 的迁移 dry-run 为 passed，没有待处理迁移、review 或错误；check 没有错误、警告或 findings，唯一 partial 原因是静态检查不能求值动态 `site`。打包回归已实际验证 preview → stable → preview 构建、中英文 Pagefind 搜索、Markdown/MDX/LLM 导出、agent discovery、草稿、缓存和无 JavaScript 内容。独立生成项目确认安装 Nimbus 0.20.0、Wrangler 4.161.0，并采用新的 overrides、UnoCSS、Vue Vite 插件及 PostCSS 依赖。
- 快照工作流的 API、CLI dry-run 均采用默认 pnpm 12.18.0，显式 12.14.0 参数仍有效。工作流契约检查与 Nimbus 升级基线检查通过。
- `pnpm install --frozen-lockfile --ignore-scripts` 通过；两份锁文件 YAML 文档均可解析且没有错误。最终 `pnpm audit --json` 为 0 漏洞；`pnpm outdated -r` 只报告有上述兼容依据的 c12 与 TypeScript。

依赖一致性报告与升级前基线一致：186 consistent、4 compatible、1 conflict、14 managed；唯一 conflict 是有意保留的 TypeScript 6/7。`repo deps peers` 同样保留原有 3 pass、5 fail、12 skipped，5 项 fail 均为工作区使用根目录测试工具而未重复声明的开发依赖。pnpm peer 报告仍有 Volar、Antfu 的 Astro formatter、recess-order 和 tsconfck 的既有范围差异，没有新增项；这些诊断命令不会返回成功，不将其表述为零告警通过。

本机没有 Docker，因此没有运行 Dev Container 的容器回归；已确认新版 `@devcontainers/cli@0.90.0` 可以执行。Node 22、Windows、Linux 和 Dev Container 矩阵保留现有配置，本次未在 GitHub 上调度或审批这些检查。
