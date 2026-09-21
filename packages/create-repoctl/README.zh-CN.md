# create-repoctl

[English](README.md) | 简体中文

用于创建 repoctl 管理的 pnpm 与 Turborepo 工作区的推荐 create 命令。

```bash
npm create repoctl@latest
pnpm create repoctl
yarn create repoctl
```

交互流程会选择目标目录和需要包含的内置模板。代理或不需要提问时：

```bash
pnpm create repoctl my-app -- --yes --templates vue-hono
npm create repoctl@latest my-app -- --yes --templates vue-hono
npx create-repoctl my-app --yes --templates vue-hono
```

模板 key：`vue-hono`、`hono-server`、`tsdown`、`vue-lib`、`vitepress`、`cli`。创建完成后运行：

```bash
cd <project>
pnpm install
pnpm exec repo init
pnpm exec repo doctor
pnpm exec repo check
```

默认输出英文。传入 `--lang zh-CN` 或设置 `REPOCTL_LANG=zh-CN` 可切换为简体中文。

## 项目链接

- 文档：https://repoctl.icebreaker.top
- 仓库：https://github.com/icelib/repoctl/tree/main/packages/create-repoctl
- 问题反馈：https://github.com/icelib/repoctl/issues
