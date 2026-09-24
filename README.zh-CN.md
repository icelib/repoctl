# repoctl

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="./brand/svg/repoctl-lockup-dark.svg">
  <source media="(prefers-color-scheme: light)" srcset="./brand/svg/repoctl-lockup-primary.svg">
  <img alt="repoctl" src="./brand/svg/repoctl-lockup-primary.svg" width="300" height="64">
</picture>

[![codecov](https://codecov.io/gh/icelib/repoctl/branch/main/graph/badge.svg?token=mWA3D53rSl)](https://codecov.io/gh/icelib/repoctl)

[English](README.md) | 简体中文

repoctl 是面向 pnpm 与 Turborepo monorepo 的任务型 CLI，用于初始化、维护、校验和发布工作区。它可以渐进接入已有仓库，也提供可选的内置模板来创建新的包与应用。

## repoctl 管理什么

- 通过 `repo init` 和 `repo doctor` 初始化并诊断工作区。
- 通过 `repo templates` 和 `repo new` 创建包与应用。
- 通过 `repo check` 和 `repo verify` 命令组执行可重复的本地校验。
- 通过 `repoctl/tooling` 管理工程配置。
- 在同一仓库维护共享 lint/config 包与 `apps/mock` fixture demo。
- 默认保留非受管文件的工作区升级。
- 基于 pnpm change intents 的正式发布与预发布。
- 面向 CI、编辑器和排障流程的 JSON 与 Markdown 报告。

## 安装

repoctl 需要 Node.js 22.13 或更高版本。

```bash
pnpm add -D repoctl
```

包名是 `repoctl`，推荐命令是 `repo`。

```bash
pnpm exec repo init
pnpm exec repo doctor
pnpm exec repo templates
pnpm exec repo new my-package
pnpm exec repo check
```

当脚本中更适合使用完整名称时，也可以使用 `repoctl`；两个 bin 提供相同命令。

## 创建工作区

```bash
npm create repoctl@latest
# 或
pnpm create repoctl@latest
```

create 命令会让你选择需要的内置模板，然后进入 `repo init`、`repo doctor`、`repo new` 与 `repo check` 的标准工作流。

### 给 AI 代理

请在 repoctl 源仓库之外的新目录或空目录中运行，不要把业务项目创建在本仓库内。

```bash
pnpm create repoctl@latest my-app -- --yes --templates vue-hono
cd my-app
corepack enable
pnpm install
pnpm exec repo init
pnpm exec repo doctor
```

模板 key：`vue-hono`（Vue/全栈）、`hono-server`（API）、`tsdown`（TypeScript 库）、`vue-lib`（Vue 组件）、`vitepress`（文档）、`cli`。不传 `--templates` 则创建空工作区，再用 `pnpm exec repo new <name> --template <key>`。

## 国际化

CLI 默认输出英文。可通过参数或环境变量显式切换为简体中文：

```bash
pnpm exec repo --lang zh-CN doctor
REPOCTL_LANG=zh-CN pnpm exec repo doctor
```

支持 `en` 和 `zh-CN`。JSON 字段、检查 ID、状态和命令名不会随语言变化。

## 包结构

| 包                                                                      | 职责                                     |
| ----------------------------------------------------------------------- | ---------------------------------------- |
| [`repoctl`](packages/repoctl)                                           | 推荐 CLI 与公共 API 入口                 |
| [`@icebreakers/monorepo`](packages/monorepo)                            | Core engine 与高级程序化 API             |
| [`@icebreakers/monorepo-templates`](packages/monorepo-templates)        | 内置模板和受管工作区资产                 |
| [`create-repoctl`](packages/create-repoctl)                             | 推荐的 `npm create` / `pnpm create` 入口 |
| [`create-icebreaker`](packages/create-icebreaker)                       | 兼容 create 入口                         |
| [`@icebreakers/eslint-config`](packages/eslint)                         | 共享 ESLint 预设与框架集成               |
| [`@icebreakers/stylelint-config`](packages/stylelint)                   | 共享 Stylelint 预设与 CSS 规范           |
| [`@icebreakers/commitlint-config`](packages/commitlint)                 | 类型完备的 Conventional Commits 配置     |
| [`@icebreakers/changelog-github`](packages/changelog-github)            | Changesets GitHub changelog 格式器       |
| [`stylelint-plugin-tailwindcss`](packages/stylelint-plugin-tailwindcss) | Tailwind/UnoCSS Stylelint 规则           |
| [`postcss-tailwindcss`](packages/postcss-tailwindcss)                   | PostCSS Tailwind 语法分析                |
| [`lightningcss-tailwindcss`](packages/lightningcss-tailwindcss)         | Lightning CSS Tailwind 语法分析          |

`templates/` 下的工作区是私有源码资产，通过 `@icebreakers/monorepo-templates` 交付，不再作为独立 npm 包发布。

## 开发

`pnpm dev` 开发 repoctl 主链路；`pnpm dev:create`、`pnpm dev:configs`、`pnpm dev:packages` 按依赖顺序构建并监听对应的包。模板服务使用 `pnpm dev:client`、`pnpm dev:server` 或 `pnpm dev:docs` 单独启动。完整入口、资产同步和调试方式见[开发场景](docs/development.md)。

```bash
corepack enable
pnpm install
pnpm build
pnpm lint
pnpm typecheck
pnpm tsd
pnpm test
```

修改可发布包时使用 `pnpm change` 记录变更，并通过 `pnpm change status` 检查发布计划。

dev-configs 相关开发包、测试、fixtures 和 demo 与 repoctl 在同一仓库维护；每个可发布包仍使用独立的 npm 版本和 release intent。

## 相关链接

- 文档：https://repoctl.icebreaker.top
- GitHub：https://github.com/icelib/repoctl
- Issues：https://github.com/icelib/repoctl/issues
- 安全策略：[SECURITY.md](SECURITY.md)
- 贡献指南：[CONTRIBUTING.md](CONTRIBUTING.md)

## 许可证

[MIT](LICENSE)
