# 发布包

需要让正式文档跟随已发布版本、main 只更新预览站时，配置[文档发布](/zh/tasks/docs)。

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

计划同时检查公开包的内部依赖协议：`dependencies`、`devDependencies`、`optionalDependencies` 必须使用 `workspace:*`；`peerDependencies` 可以使用 `workspace:*`、`workspace:^` 或 `workspace:~`。例如目标包版本为 `2.0.1` 时，pnpm pack 分别生成 `2.0.1`、`^2.0.1` 和 `~2.0.1` 的 peer 范围。按兼容性承诺选择原始声明，不要为了通过检查把 caret 或 tilde peer 改为精确版本。外部依赖范围和私有消费包不受这项发布协议约束。无效协议会使计划返回 `blocked`，而不改写 manifest 或执行发布 hooks。

JSON 与 Markdown 表达相同的原生版本决策。说明条目复用已有发布 renderer，并排除已消费的 intent 条目。私有包可以升级版本，但标记为非发布候选。公共 `createReleasePlan({ cwd })` API 返回同一报告，不自行写入文件。

计划、自动触发和版本准备统一识别根包与私有包的 intent，由 pnpm 在完整工作区内计算版本传播。Release PR 只为可发布的子包生成说明，并要求这些包具有对应版本的 changelog；根包或私有包缺少 changelog 不会阻断准备。根包即使未标记为 private，也不属于发布候选。不希望某个工作区包参与版本计算时，应配置 pnpm 的 `versioning.ignore`，不要只在实际写版本时改变工作区发现范围。

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

上传已接收表示 npm 已收到该版本，registry 查询仍可能延迟数分钟才能看到它。已接收上传的版本需要确认可查询后，才会执行后置 hooks、Git tag 和 GitHub Release。确认期间每 10 秒查询待确认版本，最多等待 15 分钟；超时会非零退出并列出待确认版本，同时保留上传已接收的证据。

工作区根目录保留两份文件：

- `pnpm-publish-summary.json`：跨尝试累计的 `publishedPackages`，包括已接收上传和 registry 已确认的版本；失败时不能仅凭此文件认定所有版本已可用。
- `repoctl-publish-progress.json`：`schemaVersion: 1`，记录 `candidates`、`acceptedPackages`、`confirmedPackages` 及 `status`（`publishing`、`confirming`、`complete`、`failed`）。已接收但未确认的版本是前两种成功状态之差。

受管 Release 工作流会在发布成功或失败后上传 `npm-publish-progress-<run_id>-<run_attempt>` artifact，保留 14 天；没有清单时跳过上传。现有项目升级 repoctl 后运行 `repo upgrade` 更新受管工作流；自定义工作流可自行添加相同上传步骤。

可见性确认超时后，保留 `repoctl-release-state` 分支中的持久化检查点，使用 `repo release ci --mode publish --source-sha <完整的发布线提交-SHA>` 恢复，并先加 `--dry-run` 预演。恢复会读取原提交准备的版本和已保存的接收证据，继续确认可见性并补齐缺失元数据，不重复上传已接收的版本。

## 跨 runner 恢复与完成判定

`repo release ci --mode=publish` 不再把本轮 npm 上传列表当作发布目标。内置 GitHub 客户端在首次上传前，将精确包版本、原提交、npm 接收证据、元数据和逐个 hook 状态写入同仓库的 `repoctl-release-state` 分支。记录键包含仓库、dist-tag 和候选版本集合，写入采用文件 SHA 比较并交换。分支需要 `contents: write` 权限，并应保留；不要删除或手动修改检查点。受管工作流仍须保持发布串行，其他自定义工作流也应避免重叠发布。

根目录的 `repoctl-release-progress.json` 是该记录的诊断副本，会与 npm 进度一起归档。只有 npm 精确版本和 dist-tag、指向原提交的标签、已发布的 GitHub Release、所有必要 hook 都完成后，生命周期记录才有 `complete: true`。`repoctl-publish-progress.json` 的 `complete` 仅表示 npm 阶段。

重跑会读取远端检查点，核对 registry 和 GitHub，只补齐缺失阶段，不重新上传已接收的版本，也不重复已完成的 hook。预发布在上传前先推送版本提交，确保新 runner 能检出原版本。新发布从完整 Git 历史确定版本来源（checkout 必须 `fetch-depth: 0`）；恢复时还会核对原提交的 manifest 和 changelog。若后续提交修改了 changelog，请检出提示的原提交后恢复。

如果 `.changeset/ledger.yaml` 已记录该包版本，以记录首次进入 Git 第一父提交历史的位置确定发布来源，包括沿用初始版本号的首次发布。普通合并对应主线上的合并提交。没有账本记录的版本（例如依赖传播升级）则沿同一条第一父提交历史回退到 manifest 的版本引入提交。尚未提交的账本记录不能建立发布来源。相对来源提交新增或删除 changelog 也会被拒绝；只有来源和当前工作区都不存在该文件时才允许缺失。

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

如果 runner 在上传期间消失，检查点可能只有 `running`，而响应尚未持久化。恢复会先进行最多 15 分钟的只读可见性确认；仍不能确认时失败，保留证据，不盲目重传。真正未上传的版本经人工核实后，可用已有 `publish-unpublished` 精确恢复入口，再重跑原发布目标完成其 hook。对任意外部 hook 不承诺 exactly-once。

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

验证脚本（`qualityScripts` 和 `hooks.verify`）不继承本次发布的控制参数，例如发布模式或恢复来源；普通 CI 与认证环境变量仍会保留。其他生命周期 hook 继续使用原有发布上下文。

## 核验 npm trusted publishing

在受管 Release 工作流的手动调度中选择 `oidc-audit`，或者在现有的 GitHub-hosted 发布 job 中运行：

```bash
pnpm exec repo release ci --mode oidc-audit
```

job 需要 `id-token: write` 和 Node.js 24.22.1，并使用实际发布时的仓库、工作流文件及 environment。另建诊断工作流会改变身份。受管工作流使用独立的核验 job，只授予 `contents: read` 和 `id-token: write`，关闭安装 lifecycle scripts，跳过 GitHub App 令牌及发布质量检查。只有 repoctl 源码仓库构建工具依赖闭包；消费方直接使用已安装的 CLI。自定义工作流也应隔离这些步骤，使用 `pnpm install --frozen-lockfile --ignore-scripts` 安装。

命令在加载发布配置前独立路由，向官方 npm registry 逐个核验有版本号的公开子包，包含已发布的包。它只申请短时交换凭据，不上传包、不修改版本或 intent、不运行 hooks、不写进度文件、不创建 tag/Release，也不保存 token。`source-sha`、`dry-run`、`package` 和 `version` 恢复输入必须为空。JSON 包含 `schemaVersion: 1`、允许展示的身份字段、每包 HTTP 状态及 npm 错误信息、整体 `ok`；即使某包失败也会继续完成全部包报告，最后以退出码 1 失败。程序化 API `auditReleaseOidc({ cwd, env?, fetch? })` 返回同一报告而不打印；调用者须检查 `ok`。

HTTP 404 或 `OIDC token exchange error - package not found` 本身无法区分包不存在、信任声明不匹配或配置过期。核对 npm 包设置里的 trusted publisher 状态，以及报告中的仓库、工作流和 environment。不要把 JWT 或交换 token 复制到日志或求助信息。

根据 [npm 首次发布验证策略](https://github.blog/changelog/2026-10-02-unvalidated-npm-trusted-publishing-configurations-now-expire/)，创建后 48 小时内没有首次成功发布的配置会过期。只有 npm 页面明确显示 `Expired` 时，才按过期处理：删除并重建该包的配置，在 48 小时内完成首次发布；单纯编辑不会重置它。“配置存在”“交换成功”“首次成功发布”是不同证据；核验不能重置或完成这个时限。首次成功发布后不再受初始 48 小时限制。实际发布继续使用 OIDC/provenance，不在发布 job 增加 npm token 兜底。

## 受管 nightly 发布

受管 Release 工作流包含手动 nightly 入口。在 **Actions → Release → Run workflow** 中选择仓库默认分支，将 mode 设为 **nightly**，并留空 `source-sha`、`package`、`version` 恢复输入。可选的 `dry-run` 输入只检查源码与渠道状态，不构建或上传。nightly 从快照计划中选取全部公开工作区包，不消费发布意图，也不改写正式版本、ledger、changelog 或 Git tag。

新项目默认提供手动入口，不自动定时发布。若要每天北京时间 03:17（UTC 19:17）检查一次，添加：

```ts
export default {
  commands: {
    release: {
      nightly: {
        provider: 'npm',
        schedule: '17 19 * * *',
        qualityTimeoutMs: 60 * 60_000,
      },
    },
  },
}
```

`provider` 默认为 `npm`。省略 `schedule` 时仅支持手动运行；定时配置使用五字段 UTC cron，GitHub 可能延迟调度。修改任一设置后，都需要预览并应用受管资产升级：

```bash
pnpm exec repo upgrade --json > ../repoctl-upgrade-plan.json
# 审查保存的计划后再应用。
pnpm exec repo upgrade --apply ../repoctl-upgrade-plan.json
```

将配置、工作流和 `.repoctl/baselines/root` 基线记录一起提交到默认分支。已有项目需先升级到包含 nightly 能力的 repoctl 版本并更新锁文件。新项目会记录 Release 工作流基线，应保留它供后续升级合并使用。缺失基线或本地改动冲突需要显式处理，`--yes` 不会绕过。自定义工作流仍受保护，preset 管理的工作流通过 `repo presets plan` / `repo presets apply` 更新。`repo init --preset standard` 不安装工作流；`--overwrite-release` 表示主动完整替换自定义 Release 工作流。删除 `schedule` 并重新同步可关闭自动运行，保留手动入口。`repo doctor` 会检查渠道、定时配置和工作流是否一致。

### 选择发布渠道

| 渠道          | 安装方式                     | 同提交手动重跑                           | 前置条件                                                                                                           |
| ------------- | ---------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `npm`（默认） | `<package>@snapshot-nightly` | 生成新的构建身份与快照版本               | 每个公开包配置匹配仓库、`release.yml` 与 environment 的 npm Trusted Publisher；`contents: read`、`id-token: write` |
| `pkg-pr-new`  | 报告中的完整提交 URL         | 核验已有字节，复用相同产物，仅上传缺失包 | 为仓库安装官方 pkg.pr.new GitHub App；`contents: read`；无需 npm token 或 npm Trusted Publisher                    |

npm 首次使用前，在工作流中运行 `oidc-audit` 并核对每个包的 npm 设置。nightly 上传前会针对实际包计划再次核验，通过 OIDC/provenance 发布，确认精确版本与 `snapshot-nightly` 标签，并检查 `latest` 未变化。安装项目发布的包：

```bash
pnpm add -D <package>@snapshot-nightly
```

使用 `pkg-pr-new` 时，先安装[官方 GitHub App](https://github.com/apps/pkg-pr-new) 并授权该仓库，再设置 `provider: 'pkg-pr-new'` 并同步工作流。报告返回 `https://pkg.pr.new/<owner>/<repo>/<package>@<完整提交-SHA>` 形式的 URL，内部依赖指向同批 URL。该渠道不发布 npm dist-tag；已有 URL 的元数据或字节与准备产物不一致时，任务失败，不覆盖已有内容。

npm 定时任务只有在全部公开包都对应当前提交和同一构建身份时才跳过。缺失包或部分发布会重新准备；registry 查询失败会使任务失败。npm 手动运行始终准备新批次，同一提交也会生成新版本。pkg-pr-new 的定时与手动运行都会重新构建并比较字节，只复用该提交 URL 下完全一致的产物，仅上传缺失包。

### 检查与诊断

nightly 执行配置的 `qualityScripts` 和 `hooks.verify`，在检出目录以外从已提交源码构建真实 tarball，并验证包导出、类型和隔离安装。版本包含基础版本、nightly 标记、完整提交 SHA 和构建摘要。发布后，干净消费者通过实际标签或 URL 安装，再核验身份、运行入口和类型。正式版本准备与发布后 hooks 仍属于普通发布流程。

每个质量脚本和 verify hook 分别计时，默认超时为 `2_700_000` 毫秒（45 分钟）。可将 `commands.release.nightly.qualityTimeoutMs` 设为正安全整数毫秒数；上面的示例为每个脚本提供 60 分钟。工作流的 job 超时仍限制整个运行，若全部任务需要更长时间，需单独调整该限制。脚本超时会中止发布，并在诊断报告中保留命令输出。

工作流使用 Node.js 24.22.1、仓库锁定的 pnpm、不保留凭据的 checkout，并复用现有发布并发组。成功与失败均保留报告、tarball 和消费者诊断 14 天；Actions 摘要提供结果与安装命令。

工作流执行：

```bash
REPOCTL_SNAPSHOT_PUBLISH=1 pnpm exec repo release nightly \
  --publish --output "$RUNNER_TEMP/repoctl-nightly" --json
```

`repo release nightly`、`createNightlyPlan(options)` 和 `releaseNightly(options)` 要求完整的 GitHub Actions schedule 或 nightly 手动调度上下文，并位于默认分支；dry-run 也需要这些条件。不带 `--publish` 时准备产物，`--dry-run` 只检查并生成仓库外部报告。本地准备使用下面的 snapshot 命令。

## PR 与 nightly 临时包

需要在正式发布前让下游验证时，先提交源码，再预览全部公开工作区包：

```bash
repo release snapshot --kind pr --pr 123 --commit <完整-HEAD-SHA> --build-id <run-id>-<attempt> --dry-run --json
repo release snapshot --kind nightly --commit <完整-HEAD-SHA> --build-id <run-id>-<attempt> --output /tmp/repoctl-artifacts
```

候选解释与基础版本复用 pnpm 原生发布计划，全部公开包共同生成快照。临时版本包含完整源码 SHA 和 PR/nightly 构建身份的确定性摘要；目标 tag 固定为 `snapshot-pr-<编号>` 或 `snapshot-nightly`，没有指定正式 tag 的入口。只在恢复同一源码、同一产物时复用 build identity。报告提供精确版本的 `pnpm add` 安装命令。

CLI 和 API 的快照计划均不加载或执行 `repoctl.config.*`，仅根据已提交的 pnpm 元数据生成计划，独立于正式发布配置。普通发布命令仍在执行前校验配置。

不带 `--publish` 时只准备可安装 tarball。流程在仓库以外提取已提交 HEAD，使用 frozen lockfile 安装依赖，改写内部引用为精确快照版本，执行根 `build`，再通过 publint、Are the Types Wrong 与隔离消费者验证真实产物。成功、失败或中断都不回写原仓库清单、intents、ledger、changelog 或 Git refs。成功与失败均保留报告目录下的 `snapshot-report.json`、tarball 和消费者诊断。强制中断可能留下未完成的临时目录；用相同身份重跑会核验 registry 证据。当前拒绝源码符号链接、Git submodule 和 `publishConfig.directory`；要求根 build 脚本与 frozen lockfile。

仅在显式授权的 GitHub Actions job 中使用 `--publish` 并设置 `REPOCTL_SNAPSHOT_PUBLISH=1`。`GITHUB_SHA` 必须与请求提交一致，event 仓库必须匹配 `GITHUB_REPOSITORY`。PR 仅允许同仓库 `pull_request`，拒绝 fork 与 `pull_request_target`；nightly 仅允许 `schedule` 或 `workflow_dispatch`。fork job 只准备产物，凭据限定在可信发布 job。snapshot 命令本身不修改工作流文件。

默认发布到公共 npm；`--registry <https-url>` 可显式指定其他 registry（只有本地测试 registry 允许 HTTP）。上传复用现有有界重试与恢复适配，不创建 GitHub Release 或 Git tag。重复身份先比较精确版本元数据与 tarball 的 SHA-512 完整性再跳过上传；状态未知或内容冲突会停止。源码产物发生变化或构建无法复现时使用新的 `--build-id`。

公开 API 为 `createSnapshotPlan(options)` 与 `releaseSnapshot(options)`。两者均返回 `schemaVersion: 1`、原生计划、快照身份、候选、精确版本、目标 tag 与安装说明；后者追加保留产物和校验结果。准备失败返回 `status: failed` 与 `error`，CLI 以退出码 1 结束。

### 由独立可信工作流发布已准备的 PR 快照

PR 快照可以同时导出审批构建与独立发布两份工作流：

```bash
repo release snapshot workflow --out .github/workflows --pnpm-version 12.14.0 --dry-run --json
repo release snapshot workflow --out .github/workflows --pnpm-version 12.14.0
```

选择与工作区 `packageManager` 一致的 pnpm 12 精确版本。命令生成 `repoctl-snapshot-build.yml` 和 `repoctl-snapshot-publish.yml`，遇到已有不同内容会整体拒绝，相同内容重复导出不修改文件。升级或自定义时，先导出到空目录，审核后一起替换两份文件。publisher 内嵌构建工作流实际字节的 SHA256，仅修改 builder 会被拒绝。导出固定当前已安装的 repoctl 版本；使用前先将审核后的两份文件合入默认分支。这是按需启用的独立流程，不改变普通 PR CI 或 Release 工作流。

创建 `pr-snapshot` 环境，配置 required reviewers，并关闭管理员绕过。为每个包配置本仓库、`repoctl-snapshot-publish.yml` 对应的 npm Trusted Publisher。流程只用内置 GitHub token 与 npm OIDC，不需要 GitHub App 或 PAT。freeze job 在环境审批通过前不分配 runner。从默认分支手动调度 **repoctl PR snapshot build**，填写已打开、非草稿、可合并的同仓库 PR 编号；fork PR 不能通过此流程发布。

也可以直接匹配已有的发布身份和审批环境：

```bash
repo release snapshot workflow --out reviewed-workflows \
  --environment package-review \
  --builder-workflow .github/workflows/pr-packages.yml \
  --publisher-workflow .github/workflows/release.yml \
  --builder-name "Approved PR packages" \
  --publisher-name "Publish PR packages"
```

输出目录中会生成 `pr-packages.yml` 和 `release.yml`。审核后放到指定的仓库相对路径；已有文件不会自动合并或覆盖。builder 来源命令、publisher 核验策略、`workflow_run` 名称、npm 发布身份和 builder 实际 SHA256 会一起生成。两个路径必须是 `.github/workflows` 直接包含的不同 YAML 文件；名称和环境必须是静态值。手工维护 publisher 时，可以传 `snapshot publish-prepared --publisher-workflow .github/workflows/release.yml`，并提供匹配的 builder 与 environment 参数；仍须由默认分支可信 `workflow_run` 执行。npm 每个包最多支持 10 个 trusted publishers，也可以保留默认 snapshot publisher，与已有正式发布身份并存。

受保护的 freeze job 读取当前 PR head/base/merge 与不可变运行身份，检查 merge 双亲，再用固定版本工具生成包、版本及依赖计划，不安装或执行候选代码。它上传 `snapshot-plan.json`，并在自身日志中记录 artifact ID、摘要及计划摘要。独立 build job 检出冻结的 merge，以只读权限构建和校验完整依赖闭包，仅上传 `snapshot-manifest.json` 及声明的 tarball。schema 版本 1 包含仓库与 PR 身份、完整 head/base/merge SHA、workflow/run/attempt、精确快照版本及依赖边、SHA512 完整性和构建/包验证结果。

默认分支的 `workflow_run` publisher 核验可信 builder 字节、reviewer 环境、审批记录、同一 attempt 内成功的 freeze/build job、可信 freeze 日志、不可变 artifact ID 和 ZIP 摘要，以及当前 PR revision。所有包和依赖必须与冻结计划一致，全部 tarball 通过检查后才请求 npm 凭据。额外或缺失包、内容篡改、危险路径和 `publishConfig`、fork、过期 revision 均在上传前失败。审批日志或 artifact 缺失、过期时，需要重新审批构建。

发布 job 没有候选 checkout，不安装、导入或执行候选代码及包脚本。它使用真实 publisher 身份运行公共 OIDC audit，仅将核验过的 tarball 发布到 `snapshot-pr-<编号>`，保持 `latest`，并确认 registry 完整性和快照 tag。重复版本只有在完整性一致时才能跳过上传。每个 PR 的发布串行执行，旧构建不能回退新构建的 tag。npm 批量发布不具备原子性：失败时可能已有部分包确认成功；用同一未改变的 artifact 重试会核对并跳过这些包。构建失败后应重跑全部 builder jobs，重新审批；仅重试 publisher 时复用原 builder run、attempt 和不可变 artifacts。PR head/base/merge 变化后需要新构建。

独立 consumer job 没有 OIDC 或写权限，安装已确认的精确版本，验证完整性、运行入口和类型。可信报告 job 向 PR 回写准确安装命令及 GitHub consumer job 结果。消费者失败会让工作流保持失败，并说明已有发布结果。provenance 表示实际的默认分支 publisher，manifest 和报告另行保留经核验的候选构建来源；不通过改写 GitHub 事件或 SHA 冒充 builder。

工作流使用以下公开 CLI/API 边界：

| 任务                 | CLI                                                                                                               | API                                       |
| -------------------- | ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| 读取冻结 GitHub 来源 | `snapshot source --pr <N> --out <source.json>`                                                                    | `freezeSnapshotSource(options)`           |
| 规划已检出的元数据   | `snapshot freeze --source <source.json> --out <snapshot-plan.json>`                                               | `createSnapshotBuildPlan(options)`        |
| 构建可移交产物       | `snapshot prepare --plan <snapshot-plan.json> --output <外部目录>`                                                | `prepareSnapshot(options)`                |
| 核验完成的构建       | `snapshot verify --run-id <id> --run-attempt <attempt> --builder-sha256 <可信摘要>`                               | `verifySnapshotRun(options)`              |
| 发布核验过的 bundle  | `snapshot publish-prepared --run-id <id> --run-attempt <attempt> --builder-sha256 <可信摘要> --output <外部目录>` | `publishPreparedSnapshot(options)`        |
| 验证精确安装结果     | `snapshot verify-consumer --report <publication.json> --output <外部目录>`                                        | `verifyPreparedSnapshotConsumer(options)` |

上表 CLI 均加 `repo release` 前缀。source 和 verifier 默认从 `GITHUB_REPOSITORY` 读取仓库，也可传 `--repository <owner/repo>`。`--json` 输出结构化结果，`--out` 写入新的结果文件。`snapshot seal` 将已上传计划绑定到可信 freeze 日志。`getSnapshotWorkflows({ pnpmVersion?, environment?, builderWorkflowPath?, publisherWorkflowPath?, builderWorkflowName?, publisherWorkflowName? })` 与导出命令使用相同参数，返回配套工作流文本。prepared publisher 仅支持公共 npm；原有本地 snapshot 与 nightly API 保持兼容。所有 snapshot 子命令均跳过可执行发布配置，不消费正式 changeset，不修改正式版本、changelog 或 release ledger。

## 下一步

阅读[发包与变更日志](/zh/learn/monorepo/publish)，再查看[报告与输出](/zh/tasks/reports)了解 CI 产物。
