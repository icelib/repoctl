# create-icebreaker

[English](README.md) | 简体中文

repoctl 管理工作区的兼容 create 命令。

已有自动化可以继续使用：

```bash
npm create icebreaker@latest
pnpm create icebreaker
```

新项目推荐使用 `npm create repoctl@latest` 或 `pnpm create repoctl`。两个入口共享同一套维护中的 scaffold engine，并进入 `repo init`、`repo doctor`、`repo new` 和 `repo check` 工作流。

默认输出英文。传入 `--lang zh-CN` 或设置 `REPOCTL_LANG=zh-CN` 可切换为简体中文。

## 项目链接

- 文档：https://repoctl.icebreaker.top
- 仓库：https://github.com/icelib/repoctl/tree/main/packages/create-icebreaker
- 问题反馈：https://github.com/icelib/repoctl/issues
