# pnpm Versioning

本模板使用 pnpm 11 原生 versioning 管理 monorepo 的变更意图、版本号、changelog 和发布。变更意图仍然使用 `.changeset/*.md` 格式，因此每次改动可以独立提交，不会直接修改包版本。

## 日常开发

```bash
pnpm change
pnpm change status
```

`pnpm change` 会询问受影响的包、patch/minor/major 类型和 changelog 摘要。脚本或自动化场景可以直接指定：

```bash
pnpm change --bump patch --summary "修复空输入崩溃" repoctl
```

变更意图会写入 `.changeset/`，与代码一起提交。`pnpm change status` 只预览计划，不会修改文件。

## 版本与 changelog

在 Release PR 中由 CI 消费变更意图：

```bash
pnpm version -r --dry-run
pnpm version -r
```

`pnpm version -r` 会更新受影响包、传播 workspace 依赖、生成 `CHANGELOG.md`，并把消费记录追加到 `.changeset/ledger.yaml`。仓库配置使用 `versioning.changelog.storage: repository`，所以 changelog 会和版本提交一起审查。

`@icebreakers/monorepo` 与 `repoctl` 属于 pnpm fixed group，任一包需要发布时两者始终使用同一个版本。

## 发布

正式发布由 Release PR 合并后的 main workflow 完成：

```bash
pnpm publish -r --report-summary --provenance --no-git-checks
```

pnpm 会跳过 registry 中已经存在的版本，并把新发布包写入 `pnpm-publish-summary.json`。CI 根据 summary 创建 `package@version` Git tag 和 GitHub Release，发布器会保留本次调用的部分成功状态，等待 registry 确认可见后再创建元数据；不要在传播延迟期间直接重跑整个生命周期，详见[发布任务](/zh/tasks/release)。

本地推荐使用 repoctl 包装命令：

```bash
pnpm exec repo release stable prepare
pnpm exec repo release stable publish
```

## Prerelease lanes

alpha、beta、rc、next 是 pnpm lanes，而不是 Changesets pre 状态：

```bash
pnpm exec repo release pre enter alpha
git add pnpm-workspace.yaml && git commit -m "chore(release): enter alpha lane"
git push

pnpm exec repo release pre publish
```

退出预发布轨道时执行 `pnpm exec repo release pre exit`，提交 `pnpm-workspace.yaml` 后合并回 main。lane 切换必须覆盖 fixed group 的全部包。

## CI 约定

- 生成的 release workflow 只负责 checkout、安装依赖和权限声明，全部业务统一由 `pnpm exec repo release ci` 执行。
- main push 先生成或更新 Release PR；Release PR 合并后才发布 npm。
- alpha、beta、rc、next 分支要求所有可发布包位于对应 lane。
- npm 发布使用 GitHub OIDC provenance，不需要长期保存 `NPM_TOKEN`。
- 未发布版本恢复使用 workflow dispatch 的 `publish-unpublished` 模式，并按 package/version 校验后发布。
- repoctl 通过 GitHub REST API 幂等创建或更新 Release PR、package tag 和 GitHub Release，重复执行不会重复创建元数据。

存量项目首次迁移运行 `pnpm dlx repoctl@latest upgrade --yes`。带有
`repoctl-managed: release/v2` 的 workflow 会自动升级；未标记的自定义
workflow 默认保留，可在确认后使用 `repo upgrade --overwrite-release`。
