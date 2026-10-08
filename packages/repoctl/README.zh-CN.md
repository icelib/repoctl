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

## fixed 版本组的发布说明

同一 `versioning.fixed` 组中的包会同步升版。只有主包声明 change intent 时，pnpm 为其他同步升版的包生成的 `CHANGELOG.md` 可能只有版本标题。

repoctl 5.8.0 起会在发布 PR 的包数量和版本表中保留这些包，并显示“仅更新版本；未记录该包的独立变更说明。”。主包的功能说明和提交归属不会复制到平台包，磁盘上的 changelog 仍由 pnpm 生成。需要记录平台包的独立改动时，为该包声明 change intent。

若旧版发布 PR 遗漏同步升版的包，在工作区主分支升级工具及锁文件，合并后让发布工作流重新生成 PR：

```bash
pnpm add -Dw repoctl@^5.8.0
```

## 语言

默认输出英文。使用 `--lang zh-CN` 或 `REPOCTL_LANG=zh-CN` 切换为简体中文。

## 高级 API

`repoctl` 会重新导出 `@icebreakers/monorepo` 的程序化 API，工程配置 wrapper 位于 `repoctl/tooling`。

## 项目链接

- 文档：https://repoctl.icebreaker.top
- 仓库：https://github.com/icelib/repoctl/tree/main/packages/repoctl
- 问题反馈：https://github.com/icelib/repoctl/issues
