# 2026-11-12 依赖升级评估

范围包括根工作区、`apps/*`、所有公开包、`templates/*`、pnpm catalog 与 overrides，以及 Playwright / Storybook 能力生成器中的固定依赖和 GitHub Actions。教学示例中的历史版本与兼容性测试的旧版本输入继续用于原有场景。

## 采用的更新

| 范围               | 更新                                                                                                               |
| ------------------ | ------------------------------------------------------------------------------------------------------------------ |
| 核心引擎           | Babel parser 8.1.2、tar 7.5.23、Knip 6.45.1                                                                        |
| 检查与格式化       | typescript-eslint 8.72.2、eslint-react 5.30.2、weapp-vite ESLint 0.3.3、better-tailwindcss 4.11.0、Prettier 3.10.0 |
| 交互与任务执行     | Inquirer 5.3 / input 5.2、Turbo 2.11.11                                                                            |
| Vue 与 Worker 模板 | Vue Router 5.5.0、tRPC 11.28.0、Hono 4.13.18、node-server 2.1.7、tailwind-variants 4.0.2                           |
| Cloudflare 工具链  | Vite 插件 1.69.0、Wrangler 4.160.1；满足插件要求的 Wrangler `^4.160.0`                                             |
| 构建与文档模板     | Vite 8.3.8、Next 16.4.6、Astro 7.4.11、MDX ESLint 3.9.5、VitePress LLMs 插件 1.15.0                                |
| 传递依赖 overrides | brace-expansion 5.0.13 / 2.1.8 / 1.1.22、glob 14.0.5、minimatch 11.0.8；保留原有作用范围和旧版 CommonJS 接口       |
| 能力生成器         | Playwright 1.65.0、Storybook 10.6.7、Vitest 与 browser-playwright 5.1.0；同步 Vite、ESLint 和框架插件基线          |
| 生成工作流         | setup-node v7.1.0、upload-artifact v7.0.2，均固定到已核验的完整 commit SHA                                         |

## 保留版本的依据

- `c12` 的 `latest` 指向 `4.0.0-rc.4`；`3x` 的稳定版仍为 3.3.4，保留稳定版本。
- 根工作区、React 和 Next 工作区已使用 TypeScript 7.0.2。核心引擎需要 TypeScript 编译器 API；Vue / Astro 检查器使用 Volar，其 `@volar/typescript` peer 范围为 `<7`，因此这些工作区继续使用 6.0.3。`@typescript/typescript6` 6.0.2 是当前最新的独立兼容包。
- ATTW 的 TypeScript 5.9.3 和 Astro WASM 桥接的 emnapi runtime 1.x 有独立内部 API 约束，保留已有定向 override。
- `@cloudflare/nimbus-docs` 仍为最新 0.19.4，未变更已审核的 Nimbus API 基线。VitePress 保留当前已采用的 2.0 alpha；不降回 1.x。
- pnpm 12.18.0、Corepack 0.36.0 和主工作流的 Actions 已为最新稳定版。生成器中的 Node 22 类型范围与 React 18 / 19 消费者范围继续表达其兼容目标。

## 验证边界

升级前与第一轮升级后的 npm 安全审计均为 0 项漏洞。递归 outdated 扫描在升级后只报告上述 `c12` 与 TypeScript 兼容性保留项；overrides 和生成器的固定版本另行查询 registry 核验。

安装仍会报告上游已有的 peer 范围限制，包括 Volar 对 TypeScript 7 的可选 peer、Antfu 对 Astro formatter 的旧范围，以及构建期打包的 Stylelint SCSS / recess 配置。已有的独立 tarball 安装、样式预设、Vue / Astro checker 与 React 声明生成测试负责验证实际运行边界，不通过放宽 peer 声明掩盖这些限制。

本次发布意图为核心引擎、repoctl、模板资产包和 ESLint 配置包的 patch；已有 nightly 功能的 minor 意图保持有效。升级 PR 的完整验证记录见对应 GitHub Actions 运行。
