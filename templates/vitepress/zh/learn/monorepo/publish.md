# monorepo 发包与变更日志

repoctl 默认使用 pnpm 原生 versioning。它保留 Changesets 格式的变更意图，同时把版本计算、依赖传播、changelog 和发布收进 pnpm 本身。

## 日常流程

先完成质量校验，再记录变更：

```bash
pnpm build
pnpm lint
pnpm typecheck
pnpm tsd
pnpm test
pnpm change
pnpm change status
```

变更意图文件放在 `.changeset/*.md`，描述受影响包和 patch/minor/major。不要手动修改包版本。

## Release PR

main push 会运行：

```bash
pnpm version -r --dry-run
pnpm version -r
```

CI 将版本号、各包 `CHANGELOG.md` 和 `.changeset/ledger.yaml` 提交到 Release PR。合并 Release PR 后，下一次 main push 执行：

```bash
pnpm publish -r --report-summary --provenance --no-git-checks
```

pnpm 根据 registry 中已有的版本自动跳过已发布包。CI 读取 `pnpm-publish-summary.json` 创建 `package@version` tag 和 GitHub Release，发布器在本次调用内保留已接收上传的版本，确认 registry 可见性后再执行后置流程；失败后的处理见[部分发布与 registry 延迟](/zh/tasks/release#部分发布与-registry-延迟)。

## Workspace versioning 配置

根 `pnpm-workspace.yaml` 中的关键配置：

```yaml
versioning:
  fixed:
    - ['@icebreakers/monorepo', repoctl]
  ignore:
    - '@icebreakers/client'
  changelog:
    storage: repository
```

`fixed` 保证组内包同版本；`ignore` 排除 private 包；`repository` 让 changelog 作为源代码提交。

## Prerelease lanes

预发布使用 pnpm lanes：

```bash
pnpm exec repo release pre enter beta
git add pnpm-workspace.yaml && git commit -m "chore(release): enter beta lane"
git push
pnpm exec repo release pre publish
```

预发布版本为 `X.Y.Z-beta.N`，并使用 npm `beta` dist-tag。退出时运行：

```bash
pnpm exec repo release pre exit
git add pnpm-workspace.yaml && git commit -m "chore(release): exit prerelease lane"
```

fixed group 必须整体切换 lane，不能只移动其中一个包。

## 恢复未发布版本

如果版本提交已合并但 npm 发布失败，在 Release workflow 手动选择 `publish-unpublished`，填入 package 和 version。CI 会校验 main 上的 manifest 版本，使用 pnpm 发布并重新生成 tag 和 GitHub Release 元数据。

## repoctl 的边界

生成的 GitHub Actions 只保留环境准备和一个 `pnpm exec repo release ci` 调用。
repoctl 负责发布前 build/lint/test、lane 一致性检查、Release PR、npm
发布、package tag 与 GitHub Release；pnpm 负责变更意图、版本计算、changelog、
ledger 和 registry 发布细节。

存量项目首次迁移运行 `pnpm dlx repoctl@latest upgrade --yes`，后续使用
`pnpm exec repo upgrade --yes` 即可跟随 repoctl 升级。未标记的自定义 release
workflow 默认不会被覆盖，确认后可使用 `repo upgrade --overwrite-release`。
