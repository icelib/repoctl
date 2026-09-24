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

失败后先下载 artifact，并用 `npm view <name>@<version> version` 对账。对于已接收但未确认的版本，继续只读确认，不要直接重跑整个发布生命周期。确认已经可用的版本可通过工作流的 `reconcile` 模式补齐元数据；仅对核实仍未上传的版本使用 `publish-unpublished`。旧清单仅用于诊断，新调用不会自动信任旧清单或跨进程续传。

## 下一步

阅读[发包与变更日志](/zh/learn/monorepo/publish)，再查看[报告与输出](/zh/tasks/reports)了解 CI 产物。
