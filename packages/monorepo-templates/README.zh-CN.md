# @icebreakers/monorepo-templates

[English](README.md) | 简体中文

repoctl 的内置项目模板和受管工作区资产包。

本包是 `repoctl` 与 `create-repoctl` 的实现依赖，发布应用、服务、库、文档站与 CLI 模板，受管根配置和工作流资产，以及模板元数据、健康检查与 scaffold API。

```ts
import { getTemplateChoices, getTemplateDefinition } from '@icebreakers/monorepo-templates'

const libraries = getTemplateChoices({ category: 'library' })
const vitepress = getTemplateDefinition('vitepress')
```

仓库 `templates/` 下的源码工作区均为私有，本包是这些模板的正式分发边界。

`createWorkspaceManifest(source, { name?, packageManager? })` 用于生成新工作区的根 manifest：将源码脚本替换为消费者可用的命令，将源码工作区依赖转换为可安装的包，并使用 `repoctl` 入口。它返回新对象，供脚手架创建使用，不用于合并已有用户项目的脚本。

## 项目链接

- 文档：https://repoctl.icebreaker.top
- 仓库：https://github.com/icelib/repoctl/tree/main/packages/monorepo-templates
- 问题反馈：https://github.com/icelib/repoctl/issues
