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
const nimbus = getTemplateDefinition('nimbus')
```

The source workspaces under the repository's `templates/` directory are private. This package is their supported distribution boundary.

Generated workspaces retain automatic pull-request CI and release-intent workflows. Approval rules for the repoctl source repository are excluded from published assets.

The managed Release workflow includes manual nightly publication from the repository's default branch. It defaults to npm `snapshot-nightly`; `commands.release.nightly.provider` can select `pkg-pr-new`. Automatic runs require an explicit `commands.release.nightly.schedule` UTC cron and a reviewed `repo upgrade` to synchronize the workflow. Source-repository schedules and quality policies are not copied.

Fresh scaffolds record the Release workflow baseline under `.repoctl/baselines/root` for later upgrades. Commit it with the workspace; existing custom or preset-owned workflows retain their ownership and conflict checks. See the [release task](https://repo.icebreaker.top/tasks/release) for setup and provider requirements.

## Project links

- Documentation: https://repo.icebreaker.top
- Repository: https://github.com/icelib/repoctl/tree/main/packages/monorepo-templates
- Issues: https://github.com/icelib/repoctl/issues
