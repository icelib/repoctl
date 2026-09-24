# @icebreakers/monorepo-templates

English | [简体中文](README.zh-CN.md)

Built-in project templates and managed workspace assets for repoctl.

This package is an implementation dependency of `repoctl` and `create-repoctl`. It publishes:

- app, service, library, documentation, and CLI templates;
- managed root tooling and workflow assets;
- template metadata and health-check helpers;
- workspace and individual-template scaffold APIs.

```ts
import {
  getTemplateChoices,
  getTemplateDefinition,
} from '@icebreakers/monorepo-templates'

const libraries = getTemplateChoices({ category: 'library' })
const vitepress = getTemplateDefinition('vitepress')
```

The source workspaces under the repository's `templates/` directory are private. This package is their supported distribution boundary.

## Project links

- Documentation: https://repoctl.icebreaker.top
- Repository: https://github.com/icelib/repoctl/tree/main/packages/monorepo-templates
- Issues: https://github.com/icelib/repoctl/issues
