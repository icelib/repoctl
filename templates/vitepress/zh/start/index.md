# 从这里开始

如果你第一次使用 repoctl，请从这一节开始。最短的有效路径是安装 CLI，执行 `repo init`，再执行 `repo doctor`。

## 选择第一次操作

- 如果还没有运行过命令，阅读[安装并初始化](./install.md)。
- 阅读[什么是 repoctl？](./what-is-repoctl.md)了解产品定位。
- 阅读[安装 repoctl](./install-repoctl.md)快速完成设置。
- 如果已经安装 repoctl，直接[运行第一次诊断](./diagnose.md)。
- 得到诊断结果后，进入[选择下一项任务](./choose-next.md)。

## repoctl 做什么

repoctl 把常见 monorepo 工作收敛为一组容易记忆的命令：

| 需求             | 命令                   |
| ---------------- | ---------------------- |
| 加入仓库约定     | `repo init`            |
| 检查仓库健康状态 | `repo doctor`          |
| 创建包或应用     | `repo new`             |
| 执行前规划校验   | `repo check --dry-run` |

CLI 支持 pnpm workspace，并能理解 Turborepo 任务图，但不会替代这两个工具。

## 开始前确认

你需要 Node.js 22.13 或更新版本，并确保 pnpm 在 PATH 中。从仓库根目录执行命令，这样 repoctl 才能读取 workspace 配置。
