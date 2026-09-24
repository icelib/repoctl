# repoctl

[English](README.md) | 简体中文

`repoctl` 是 repoctl CLI 的推荐安装包。包名为 `repoctl`，主要命令为 `repo`。

## 安装

```bash
pnpm add -D repoctl
```

## 接入已有工作区

```bash
pnpm exec repo init
pnpm exec repo doctor
pnpm exec repo templates
pnpm exec repo new my-package
pnpm exec repo check
```

生成后的工作区还会提供 `repo:init`、`repo:doctor`、`repo:new` 和 `repo:check` 等无冲突根脚本。

## 常用工作流

```bash
pnpm exec repo doctor --json
pnpm exec repo upgrade --yes
pnpm exec repo new dashboard --template vue-hono --json
pnpm exec repo check --dry-run
pnpm exec repo check --full
pnpm exec repo env support --json --redact --out reports/support.json
```

## 语言

默认输出英文。使用 `--lang zh-CN` 或 `REPOCTL_LANG=zh-CN` 切换为简体中文。

## 高级 API

`repoctl` 会重新导出 `@icebreakers/monorepo` 的程序化 API，工程配置 wrapper 位于 `repoctl/tooling`。

## 项目链接

- 文档：https://repoctl.icebreaker.top
- 仓库：https://github.com/icelib/repoctl/tree/main/packages/repoctl
- 问题反馈：https://github.com/icelib/repoctl/issues
