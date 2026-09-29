# 发布包

当改动准备好更新版本并发布时，使用这个任务页。任何写入 registry 的操作都应该先经过可审查的发布计划。

## 前置条件

- `repo doctor` 报告包管理器和发布配置有效。
- 工作区除本次改动外保持干净。
- 每个可发布改动都有 changeset 或仓库约定的 intent 文件。

## 最小命令

```bash
repo release --dry-run
```

检查包组、版本、变更日志和发布命令。计划确认后，再去掉 `--dry-run` 执行发布。

## 预期结果

发布报告会列出将要变化的包、版本决策和每个子进程。发布成功后，还会执行配置好的 post-publish hooks。

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

## 下一步

阅读[发包与变更日志](/zh/learn/monorepo/publish)，再查看[报告与输出](/zh/tasks/reports)了解 CI 产物。
