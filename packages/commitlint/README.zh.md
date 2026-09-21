# @icebreakers/commitlint-config

## 概览

`@icebreakers/commitlint-config` 在保留 `@commitlint/config-conventional` 的基础上提供了类型完备的工厂 API，可以按团队需求扩展类型、Scope、Subject 等规则，并自动同步 Commit Prompt 的选项。它非常适合在 Monorepo 中统一 Conventional Commits。

## 安装

```bash
pnpm add -D @commitlint/cli @icebreakers/commitlint-config
```

## 快速开始

在仓库根目录创建 `commitlint.config.ts`：

```ts
import { icebreaker } from '@icebreakers/commitlint-config'

export default icebreaker()
```

在脚本或 Husky 钩子中调用：

```bash
pnpm commitlint --from=HEAD~1
```

如果需要显式函数名，也可以使用 `createIcebreakerCommitlintConfig(options)`，返回值与 `icebreaker` 完全一致。

## 自定义规则

工厂函数按类别接收配置，方便针对性地覆盖默认约束：

```ts
import {
  icebreaker,
  RuleConfigSeverity,
} from '@icebreakers/commitlint-config'

export default icebreaker({
  types: {
    definitions: [
      { value: 'docs', title: 'Docs', description: '文档更新', emoji: '📝' },
      { value: 'deps', title: 'Dependencies', description: '依赖升级' },
    ],
    add: ['perf'],
  },
  scopes: {
    values: ['core', 'lint', 'website'],
    required: true,
    case: ['kebab-case', 'lower-case'],
  },
  subject: {
    forbidden: ['sentence-case', 'start-case'],
    caseSeverity: RuleConfigSeverity.Warning,
    fullStop: false,
  },
  header: {
    maxLength: 100,
  },
  extends: ['@acme/commitlint-config'],
})
```

- `types`：新增类型、补充 Prompt 元数据或强化 `type-enum` 规则。
- `scopes`：限定 Scope 值、设置大小写规则或强制 Scope 必填。
- `subject`：限制 Subject 大小写、控制末尾标点、允许空 Subject。
- `header`：修改头部长度或告警级别。
- `extends` / `rules`：叠加额外的 commitlint 配置或自定义规则。
- `prompt`：在保留原有交互式提示的前提下合并自定义菜单。

所有严重级别均使用 `@commitlint/types` 暴露的 `RuleConfigSeverity`。

## Prompt 同步

工厂函数会将自定义类型合并进 commit Prompt。若传入 `prompt` 字段，会与默认配置深度合并，确保交互式命令自动展示新增的类型、Scope 或描述信息。

## 推荐流程

1. 安装 Husky 并配置 `commit-msg` 钩子：
   ```bash
   pnpm husky add .husky/commit-msg "pnpm commitlint --edit \"$1\""
   ```
2. 通过 `pnpm commit`（Changeset）或自定义的 CLI 引导书写 Commit。
3. 在 CI 中运行 `pnpm lint`、`pnpm test`，并在发布脚本中保留 commitlint 校验。

## 常见问题

- commitlint 找不到配置时，请确认文件名为 `commitlint.config.ts`（或 `.cjs`），且位于仓库根目录。
- 如需扩展交互式提示，直接传入 `prompt` 即可，无需手动拼装 Schema。
- 若需在某些脚本中临时关闭校验，可在环境变量中设置 `COMMITLINT_DISABLED=true` 并跳过钩子。

## 项目链接

- 文档：https://repoctl.icebreaker.top
- 仓库：https://github.com/icelib/repoctl/tree/main/packages/commitlint
- 问题反馈：https://github.com/icelib/repoctl/issues
