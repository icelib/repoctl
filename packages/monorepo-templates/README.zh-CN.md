# @icebreakers/monorepo-templates

[English](README.md) | 简体中文

repoctl 的内置项目模板和受管工作区资产包。

本包是 `repoctl` 与 `create-repoctl` 的实现依赖，发布应用、服务、库、文档站与 CLI 模板，受管根配置和工作流资产，以及模板元数据、健康检查与 scaffold API。

```ts
import { getTemplateChoices, getTemplateDefinition } from '@icebreakers/monorepo-templates'

const libraries = getTemplateChoices({ category: 'library' })
const nimbus = getTemplateDefinition('nimbus')
```

仓库 `templates/` 下的源码工作区均为私有，本包是这些模板的正式分发边界。

生成的工作区保留自动运行的 PR CI 和发布意图工作流。repoctl 源仓库的审批规则不进入发布资产。

受管 Release 工作流支持从仓库默认分支手动发布 nightly，默认使用 npm 的 `snapshot-nightly`；也可以通过 `commands.release.nightly.provider` 选择 `pkg-pr-new`。自动发布需要显式配置 `commands.release.nightly.schedule` UTC cron，再审查并应用 `repo upgrade`，同步工作流。源仓库专用的定时配置与质量策略不会进入模板。

新项目会在 `.repoctl/baselines/root` 记录 Release 工作流基线，需与项目一起提交，供后续升级合并使用。已有的自定义工作流与 preset 管理工作流继续保留其归属及冲突检查。配置方法和渠道要求见[发布任务文档](https://repo.icebreaker.top/zh/tasks/release)。

## 项目链接

- 文档：https://repo.icebreaker.top
- 仓库：https://github.com/icelib/repoctl/tree/main/packages/monorepo-templates
- 问题反馈：https://github.com/icelib/repoctl/issues
