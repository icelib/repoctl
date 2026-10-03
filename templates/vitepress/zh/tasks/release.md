# 发布包

当改动准备好更新版本并发布时，使用这个任务页。任何写入 registry 的操作都应该先经过可审查的发布计划。

## 前置条件

- `repo doctor` 报告包管理器和发布配置有效。
- 工作区除本次改动外保持干净。
- 每个可发布改动都有 changeset 或仓库约定的 intent 文件。

## 最小命令

```bash
repo release plan --markdown
```

检查当前/目标版本、直接 intent、pnpm 原生依赖传播及固定组原因、lane、私有包、发布候选和发布说明预览。机器读取使用 `repo release plan --json`，结构版本为 `schemaVersion: 1`，状态为 `ready`、`empty` 或 `blocked`。阻断时退出码为 1，并提供稳定的 blocker ID。

版本决策委托给 pnpm 递归 dry-run（已验证 pnpm 12.8.1）。计划不消费 intents，不修改 manifest、changelog、ledger 或 Git 状态，不安装或激活 pnpm，不执行版本、发布或 pnpmfile hooks，也不写入 registry。未安装支持的 pnpm 时请先显式安装。可能改写准备输入的 hooks 不会执行；需要这些改动时先显式完成，再重新生成计划。

审查完成后使用独立入口 `repo release ci --mode=prepare` 准备版本。已有版本的发布或恢复预览使用 `repo release ci --mode=publish --dry-run`。版本计划描述待消费 intents，不检查 registry 认证，也不代表发布一定成功。

## 预期结果

JSON 与 Markdown 表达相同的原生版本决策。说明条目复用已有发布 renderer，并排除已消费的 intent 条目。私有包可以升级版本，但标记为非发布候选。公共 `createReleasePlan({ cwd })` API 返回同一报告，不自行写入文件。

## 正式分支与维护版本线

在 `repoctl.config.*` 中配置 `commands.release.branches`：

```ts
export default {
  commands: {
    release: {
      branches: {
        stable: 'master',
        maintenance: [{ branch: '1.x', range: '1.x', tag: 'legacy-1' }],
        prerelease: [
          { branch: 'preview/1.x', lane: 'beta', tag: 'legacy-beta', target: '1.x' },
        ],
      },
    },
  },
}
```

省略配置保留 `main` 和 `alpha`、`beta`、`rc`、`next`。`stable` 默认是 `main`；省略 `prerelease` 时保留这四个 lane，并指向正式分支；显式 `prerelease: []` 可禁用预发布。正式分支与维护分支都使用 pnpm 原生 `main` lane；Git 分支名和 npm 标签分别配置。

维护范围必须有有限上界，彼此不能重叠。主正式分支负责所有维护范围以外的版本。范围约束整个仓库的可发布包；各包采用独立主版本时，也需要共同满足所选发布线。私有包仍参与 pnpm 原生版本计算，但不作为发布候选。分支名、npm 标签、预发布 lane 必须唯一。`1.x` 这类 SemVer 范围不能作为 npm 标签，示例使用 `legacy-1`；`snapshot-` 前缀保留给临时包。

```bash
repo release plan --branch 1.x --markdown
repo release plan --branch master --json
```

计划增加 `branchRule`，包含 `branch`、`kind`、`lane`、`range`、`excludedRanges`、`distTag` 和 `target`。显式 `--branch` 或 API `branch` 优先，其次使用匹配的 `GITHUB_REF_NAME`；其他情况的只读计划以主正式分支为目标。执行则使用当前 Git 分支或 CI ref，未配置的分支会被拒绝。API `resolveReleaseBranches(config)` 返回同一份已校验映射。

准备前先用 pnpm 原生 dry-run 检查范围，越界时在执行发布 hooks、写版本、消费 intents 之前停止；校验 hooks 完成后再检查一次。实际写入版本及最终发布候选也会复核，hook 改写版本后仍须满足所选发布线。repoctl 无法撤销任意 hook 的外部副作用；准备或发布中断后继续使用 pnpm ledger 和现有发布检查点恢复。

Release PR 以所选分支为 base。主正式线保留 `release/pnpm-version`；维护线使用 `release/pnpm-version-<编码后的分支名>`，可同时存在。维护发布只使用自己的 dist-tag，GitHub Release 仍标记为正式版本。`repo release pre enter beta` 选择声明的 pnpm lane；`repo release pre exit` 回到目标的原生 `main` lane，并输出正式或维护目标分支，不切换 Git 分支。

修改映射后，先用 `repo upgrade --dry-run --json` 审查，再应用升级，同步受管 Release 工作流的 push 分支。保存的计划会检测配置变化；重复升级无新差异；自定义工作流仍受保护，除非显式要求替换。workflow dispatch 和原提交恢复应在目标配置分支运行，发布工作流保持串行，并保留检查点。

## 常见分支

- 缺少 intent：添加 changeset 后重新生成计划。
- 固定版本组不一致：先检查包之间的关系，再修改版本。
- registry 认证失败：刷新本地 token 后重试，不要提交凭据。

## 部分发布与 registry 延迟

发布器最多尝试上传 3 次，重试前分别等待 20、40 秒并重新查询 registry。明确上传成功的精确版本不会再次上传，即使此时 `npm view` 暂不可查询。普通权限错误和没有瞬时故障依据的 404 会直接失败；冲突只能通过只读对账确认，不能当作成功。

已接收上传的版本需要确认可查询后，才会执行后置 hooks、Git tag 和 GitHub Release。确认期间每 10 秒查询待确认版本，最多等待 5 分钟；超时会非零退出并列出待确认版本。

工作区根目录保留两份文件：

- `pnpm-publish-summary.json`：跨尝试累计的 `publishedPackages`，包括已接收上传和 registry 已确认的版本；失败时不能仅凭此文件认定所有版本已可用。
- `repoctl-publish-progress.json`：`schemaVersion: 1`，记录 `candidates`、`acceptedPackages`、`confirmedPackages` 及 `status`（`publishing`、`confirming`、`complete`、`failed`）。已接收但未确认的版本是前两种成功状态之差。

受管 Release 工作流会在发布成功或失败后上传 `npm-publish-progress-<run_id>-<run_attempt>` artifact，保留 14 天；没有清单时跳过上传。现有项目升级 repoctl 后运行 `repo upgrade` 更新受管工作流；自定义工作流可自行添加相同上传步骤。

## 跨 runner 恢复与完成判定

`repo release ci --mode=publish` 不再把本轮 npm 上传列表当作发布目标。内置 GitHub 客户端在首次上传前，将精确包版本、原提交、npm 接收证据、元数据和逐个 hook 状态写入同仓库的 `repoctl-release-state` 分支。记录键包含仓库、dist-tag 和候选版本集合，写入采用文件 SHA 比较并交换。分支需要 `contents: write` 权限，并应保留；不要删除或手动修改检查点。受管工作流仍须保持发布串行，其他自定义工作流也应避免重叠发布。

根目录的 `repoctl-release-progress.json` 是该记录的诊断副本，会与 npm 进度一起归档。只有 npm 精确版本和 dist-tag、指向原提交的标签、已发布的 GitHub Release、所有必要 hook 都完成后，生命周期记录才有 `complete: true`。`repoctl-publish-progress.json` 的 `complete` 仅表示 npm 阶段。

重跑会读取远端检查点，核对 registry 和 GitHub，只补齐缺失阶段，不重新上传已接收的版本，也不重复已完成的 hook。预发布在上传前先推送版本提交，确保新 runner 能检出原版本。新发布从完整 Git 历史确定版本来源（checkout 必须 `fetch-depth: 0`）；恢复时还会核对原提交的 manifest 和 changelog。若后续提交修改了 changelog，请检出提示的原提交后恢复。

旧版发布没有检查点时，可从 npm 的 `gitHead` 恢复原提交。缺失该字段时必须人工核对来源后显式设置 `REPO_RELEASE_SOURCE_SHA`，不能使用重跑 HEAD 猜测。所有目标已有 Release 的历史任务保持 no-op，不倒推重放历史 hook。无记录且缺失元数据的历史任务中，hook 结果按未知处理。

```bash
repo release ci --mode=publish --dry-run
repo release ci --mode=publish
```

预演会查询远端并展示目标版本、原提交、npm 阶段、缺失标签/Release 和 hook 状态，不执行上传、hook 或检查点写入。查询超时、TLS 错误、鉴权失败、限流和服务端错误不当成版本不存在；原提交未知或标签冲突明确失败，绝不强制移动标签。GitHub 请求有 30 秒超时和有界退避。

### Hook 恢复策略

`afterPublish` 脚本名必须唯一，重跑时须保留原脚本集合。每个脚本执行前写入 `running`，成功后写入 `complete`；允许忽略的失败记为 `ignored`。未知结果的非幂等脚本不会自动重试。只有重复执行不会增加副作用时，才声明：

```ts
const hook = { script: 'publish:extension', idempotent: true }
```

如果外部系统已确认脚本成功，可显式设置 `REPO_RELEASE_ACKNOWLEDGE_HOOKS=publish:extension` 后恢复；多个脚本用逗号分隔。该操作表示人工确认完成，不会再次执行脚本。确认失败或未知时，不应使用此开关。

如果 runner 在上传期间消失，检查点可能只有 `running`，而响应尚未持久化。恢复会先进行最多 5 分钟的只读可见性确认；仍不能确认时失败，保留证据，不盲目重传。真正未上传的版本经人工核实后，可用已有 `publish-unpublished` 精确恢复入口，再重跑原发布目标完成其 hook。对任意外部 hook 不承诺 exactly-once。

程序化注入的旧 `GitHubOperations` adapter 保留原行为；要启用跨 runner 恢复，需要实现 `readReleaseState`、`writeReleaseState`、`listReleases`、`ensureTag`，并建议提供 `readTagTarget`。写入必须校验 revision，查询错误必须抛出。仅有本地 summary 不能代替远端检查点。

## 无需发布的记录与原提交恢复

仅包含 `none` 或空 frontmatter 的 intent 表示无需发布。它不会创建版本 PR，也不阻断已经准备好的版本发布。合并后重新出现、但 ledger 已记录消费的 intent 不会再次升级版本；pnpm 会在下一次有效版本操作中清理这些文件。

版本 PR 以 pnpm 返回的实际发布包列表为依据，不再把任意 Git 改动视为版本变化。新包首次发布可以保留初始版本号，但仍会列入发布说明。仅清理记录不会创建发布 PR。

已有版本尚未完成发布时，新的版本准备会在消费 intent 前失败，并给出原始提交和恢复命令。先恢复旧发布，再准备新版本：

```bash
repo release ci --mode publish --source-sha <完整的发布线提交-SHA> --dry-run
repo release ci --mode publish --source-sha <完整的发布线提交-SHA>
repo release ci --mode prepare
```

受管 Release 工作流为 `publish` 和 `publish-unpublished` 提供相同的 `source-sha` 输入。当前工具会在独立目录检出原提交，按照其锁文件安装、构建和验证，恢复该提交 manifest 或 ledger 新增的整批版本，包括依赖传播升级的包。package/version 输入只校验是否属于该批发布，不拆分原发布批次。SHA 必须属于 `origin/<所选分支>` 历史；以当前调度配置确定发布线，历史源码中的旧映射不会改变目标。dry-run 只检查源码与远端状态，不安装、不上传、不运行 hook、不写检查点。后续变更保留到下一版本；恢复过程中不修改版本号。

恢复保留 GitHub 工作流环境，供可信发布和 provenance 使用：签名身份对应运行工作流的提交；独立检出的源码、发布检查点、Git tag 和 Release 目标则对应 `source-sha`。不要通过覆盖 `GITHUB_SHA` 恢复旧源码，npm 会拒绝与工作流签名身份不一致的 provenance。

## 下一步

阅读[发包与变更日志](/zh/learn/monorepo/publish)，再查看[报告与输出](/zh/tasks/reports)了解 CI 产物。

## PR 与 nightly 临时包

需要在正式发布前让下游验证时，先提交源码，再预览全部公开工作区包：

```bash
repo release snapshot --kind pr --pr 123 --commit <完整-HEAD-SHA> --build-id <run-id>-<attempt> --dry-run --json
repo release snapshot --kind nightly --commit <完整-HEAD-SHA> --build-id <run-id>-<attempt> --output /tmp/repoctl-artifacts
```

候选解释与基础版本复用 pnpm 原生发布计划，全部公开包共同生成快照。临时版本包含完整源码 SHA 和 PR/nightly 构建身份的确定性摘要；目标 tag 固定为 `snapshot-pr-<编号>` 或 `snapshot-nightly`，没有指定正式 tag 的入口。只在恢复同一源码、同一产物时复用 build identity。报告提供精确版本的 `pnpm add` 安装命令。

不带 `--publish` 时只准备可安装 tarball。流程在仓库以外提取已提交 HEAD，使用 frozen lockfile 安装依赖，改写内部引用为精确快照版本，执行根 `build`，再通过 publint、Are the Types Wrong 与隔离消费者验证真实产物。成功、失败或中断都不回写原仓库清单、intents、ledger、changelog 或 Git refs。成功与失败均保留报告目录下的 `snapshot-report.json`、tarball 和消费者诊断。强制中断可能留下未完成的临时目录；用相同身份重跑会核验 registry 证据。当前拒绝源码符号链接、Git submodule 和 `publishConfig.directory`；要求根 build 脚本与 frozen lockfile。

仅在显式授权的 GitHub Actions job 中使用 `--publish` 并设置 `REPOCTL_SNAPSHOT_PUBLISH=1`。`GITHUB_SHA` 必须与请求提交一致，event 仓库必须匹配 `GITHUB_REPOSITORY`。PR 仅允许同仓库 `pull_request`，拒绝 fork 与 `pull_request_target`；nightly 仅允许 `schedule` 或 `workflow_dispatch`。fork job 只准备产物，凭据限定在可信发布 job。现有 stable 与 prerelease workflow 不会被修改。

默认发布到公共 npm；`--registry <https-url>` 可显式指定其他 registry（只有本地测试 registry 允许 HTTP）。上传复用现有有界重试与恢复适配，不创建 GitHub Release 或 Git tag。重复身份先比较精确版本元数据与 tarball 的 SHA-512 完整性再跳过上传；状态未知或内容冲突会停止。源码产物发生变化或构建无法复现时使用新的 `--build-id`。

公开 API 为 `createSnapshotPlan(options)` 与 `releaseSnapshot(options)`。两者均返回 `schemaVersion: 1`、原生计划、快照身份、候选、精确版本、目标 tag 与安装说明；后者追加保留产物和校验结果。准备失败返回 `status: failed` 与 `error`，CLI 以退出码 1 结束。
