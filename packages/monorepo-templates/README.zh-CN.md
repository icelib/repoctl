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

## 项目链接

- 文档：https://repoctl.icebreaker.top
- 仓库：https://github.com/icelib/repoctl/tree/main/packages/monorepo-templates
- 问题反馈：https://github.com/icelib/repoctl/issues
