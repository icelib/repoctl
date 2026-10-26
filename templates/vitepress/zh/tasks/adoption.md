# 在现有工作区接入 repoctl

仓库保留发布策略和领域检查，repoctl 提供自动 changeset、冻结 Release PR 校验、原生 hooks 安装及 prepared snapshot 配置入口。这些公共 API 也从 `@icebreakers/monorepo` 导出，无需复制通用 JS 编排。

## 自动 changeset

在默认分支维护 `.github/repoctl-auto-changeset.json`。空对象的默认策略为 patch、conventional `feat` 标题为 minor，支持 `release:patch`、`release:minor`、`release:major` 和 `release:none` 标签；破坏性标题要求显式级别。冲突标签会失败，外部依赖升 major 不会自动把消费包也升 major。

以下示例表达包联动关系，请替换成自己的包名与路径：

```json
{
  "schemaVersion": 1,
  "ignorePaths": ["**/test/**", "**/test-d/**"],
  "paths": [
    { "patterns": ["templates/**"], "packages": ["weapp-vite"] },
    { "patterns": ["docs/**"], "release": false }
  ],
  "links": [
    { "from": ["weapp-vite", "wevu"], "to": ["create-weapp-vite"], "level": "patch" },
    { "from": ["@weapp-vite/constants"], "dependents": true, "dependencyFields": ["dependencies", "optionalDependencies"], "level": "patch" }
  ],
  "titleTypes": { "feat": "minor", "fix": "patch", "deps": "patch" },
  "breakingRequiresLabel": true,
  "summary": { "language": "zh-CN", "template": "变更：{title}（#{number}）" }
}
```

路径规则取第一个匹配项；包选择和联动支持包名 glob，联动传播到稳定为止。摘要支持 `{title}`、`{number}`、`{packages}`、`{level}`，也可用 `summary.byType` 按 conventional commit 类型提供模板。私有包可参与联动，但不会生成其发布意图。

```bash
repo release auto-changeset --repository owner/repository --pr 123 --json
repo release auto-changeset --workflow --out .github/workflows/repoctl-auto-changeset.yml
```

`createAutoChangesetPlan(options)` 通过 GitHub 元数据和真实 `pnpm-workspace.yaml` globs 发现包，支持嵌套目录、排除项及依赖别名，并返回有 schema 版本的计划。策略来自默认分支不可变 revision；不加载候选 `repoctl.config`、脚本或 pnpmfile。可信 API 调用方也可直接提供经过校验的 `policy` 对象。

`getAutoChangesetWorkflow(options)` 导出固定版本、无需 checkout 的薄工作流。先把策略和工作流合入默认分支，为 `release-intent-write` 环境配置 required reviewers 并关闭管理员绕过，再手动选择同仓 PR。只读 plan job 冻结 head/base、策略、标题、标签和 Actions attempt；受保护 apply job 在审批后重新计算，并调用 `applyAutoChangeset({ ...options, expected: plan.revision })`。CLI 等价入口为 `--apply --expected <plan.json>`，同样要求可信工作流上下文。可配置工作流路径/名称、plan/apply job 名称、审批环境和策略路径。

写入通过 `expectedHeadOid` 原子校验冻结 head 后追加提交。GitHub 响应截断或不一致、refs 移动、策略/标题/标签变化、缺失审批和跨 attempt 复用都会在更新分支前失败；fork PR 只读。此按需工作流使用内置 GitHub token，它产生的提交不会自动触发新的 Actions 运行，需通过仓库既有准入流程验证新的 head。

合法手写 intent 优先。生成的 `.changeset/auto-pr-<编号>.md` 带所有权和内容校验标记；人工修改或无标记文件不会覆盖。校验和用于发现内容修改，不是作者签名。撤回改动、添加手写 intent 或选择 `release:none` 后，后续执行会删除完整的受管文件；删除公开包需要手写 intent 或明确无需发布。重复相同计划不会额外提交。

## 校验正式 Release PR

这是对原生 `pnpm version -r` 结果的校验，与 snapshot artifact 校验独立。先冻结完整 base/head commit ID：

```bash
repo release validate-preparation --base <完整base-sha> --head <完整head-sha> --branch main --json
repo release validate-preparation --base <完整base-sha> --head <完整head-sha> --policy .github/release-validation.json --json
```

JSON 策略从冻结 base 的 Git blob 读取。例如 `{ "branch": "main" }` 选择默认正式发布线；`branches` 使用已有的[发布线策略](/zh/tasks/release)。`--policy` 与 `--branch` 互斥。分支名前缀只能选择此验证路径，只有 `status: "valid"` 才允许豁免普通发布意图检查；失败后不能回退到把删除的 `.changeset` 文件当成新增 intent。

`validateReleasePreparation({ cwd, base, head, policy })` 只将元数据复制到临时目录，重放原生 pnpm version，核对 manifest、已消费 intents、ledger、changelog 追加与依赖传播，包含 fixed 组和预发布 lane。间接变化的包不必各自拥有 ledger 项或增加版本。验证不安装依赖，不执行候选 scripts、pnpmfile 或发布 hooks；使用与准备阶段相同的已安装 pnpm。当前工作树、索引及 Git refs 均不修改。

有 schema 版本的报告包含 `status`、逐包版本/原生原因/验证状态、文件 expected/missing/mismatch/unexpected 结果及结构化错误。额外源码变更、历史 changelog 改写和未验证生成物会失败。当前原生 pnpm 不修改 lockfile，因此 lockfile 变更不能通过该豁免。

自定义 hook 产物需在可信 `generatedFiles` 中声明精确路径与 SHA256。可信 API 调用方也可提供 `validate(context)`，按复制的前后字节和原生包计划验证；不从候选源码导入回调。扩展不能覆盖 manifest、changelog、intent、ledger、workspace 配置及 lockfile 的检查。无法验证时应说明原因并拒绝豁免。

随包 `resources/release-validation/` 提供可复用薄工作流；启用前固定到实际已发布且包含该 API 的 repoctl/pnpm 版本。源码仓从冻结可信 base 构建验证工具；消费者从 base 的锁定依赖安装工具并禁用 lifecycle scripts。消费者保持自动 PR 检查，Release 类分支也必须获得有效验证报告。

## 安全安装原生 hooks

安装 `repoctl`、`lefthook` 开发依赖后，用公共入口作为根 `prepare`：

```json
{ "scripts": { "prepare": "repo tooling hooks install" } }
```

在 `pnpm-workspace.yaml` 关闭 Lefthook 自身依赖安装脚本，使上述入口独占安装：

```yaml
allowBuilds:
  lefthook: false
```

使用旧版构建 allowlist 时，从该列表移除 Lefthook。保留仓库原生 `lefthook.yml`；`installGitHooks(cwd, options?)` 与 `repo tooling hooks install --json` 支持普通 checkout、linked worktree、重复执行和 CI 跳过。仅迁移能够识别为仓库旧 Husky 的设置；自定义 Husky 及 local/include/global/system `core.hooksPath` 受保护。移除受管 local 值后会重新检查实际生效配置，避免覆盖随后显露的用户设置。

领域检查在 `repoctl.config.ts` 中声明：

```ts
export default {
  tooling: {
    hooks: {
      preCommit: [
        { name: 'inventory', run: 'pnpm inventory:check', glob: '**/*.vue' },
        { name: 'skills', run: 'pnpm skills:check' },
        { name: 'project-json', run: 'pnpm project-json:fix', glob: '**/project*.json', stageFixed: true },
      ],
    },
  },
}
```

配置生成原生 Lefthook jobs，插入最终 `pnpm exec repo verify staged-typecheck` 前。需保留 `pre-commit.piped: true`；不兼容的原生结构会报错，不强制重写。Lefthook 负责部分暂存保护和 `stage_fixed`。不配置 `preCommit` 会保留已有 jobs；显式 `preCommit: []` 仅移除此前生成的 `repoctl-domain:` jobs。DOM inventory、skills 和平台项目 JSON 检查继续由仓库维护。

staged typecheck 将根 tooling 和包文件分别交给最近的 typecheck 脚本，每个脚本仅执行一次。根脚本不会覆盖包检查，根与包 TypeScript 同时暂存时也能发现包内类型错误。

## 配置 prepared snapshot

`snapshot publish-prepared --publisher-workflow` 可复用已有可信发布文件名。[配套工作流导出](/zh/tasks/release)还支持审批环境、builder/publisher 路径和名称，并生成匹配的 builder 摘要。审核后提交两份工作流；安装 repoctl 本身不会启用源码仓 snapshot 发布。
