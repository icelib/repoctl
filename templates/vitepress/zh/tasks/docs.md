# 让文档随稳定版本发布

合并后的文档先更新预览站，正式站继续描述用户已经能安装的版本。当前支持 `main` 与 npm `latest` 通道；维护分支和预发布版本不会推进正式文档。

## 配置站点

在 `repoctl.config.ts` 中显式添加站点：

```ts
import { defineMonorepoConfig } from 'repoctl'

export default defineMonorepoConfig({
  commands: {
    docs: {
      sites: {
        guide: {
          packages: ['@example/core'],
          buildScript: 'docs:build',
          preview: {
            deployScript: 'docs:deploy:preview',
            url: 'https://next.example.com',
          },
          stable: {
            deployScript: 'docs:deploy:stable',
            url: 'https://docs.example.com',
          },
          patchPaths: ['website/docs/**', 'website/static/img/**'],
        },
      },
    },
  },
})
```

站点 ID 使用小写字母、数字和连字符。`packages` 指定文档描述的已发布工作区产品包，自动包含其工作区 dependencies、optionalDependencies 和 peerDependencies。脚本名对应根 `package.json`。正式站和预览站应使用不同部署目标，预览构建应明确标注“未发布文档”并禁止搜索引擎收录。

默认发布检查将每个覆盖包的目录与其已发布 Git 来源比较，排除 README、CHANGELOG、docs 和测试文件；包清单始终参与检查。如果构建读取包目录之外的共享输入，在 `releaseInputs` 中为对应包配置仓库相对路径：

```ts
const releaseInputs = {
  '@example/core': [
    'packages/core/**',
    '!packages/core/test/**',
    '!packages/core/CHANGELOG.md',
    'scripts/build/**',
    'tsconfig.base.json',
  ],
}
```

显式列表会替换该包的默认规则。覆盖包必须具有发布证据、匹配的版本与来源历史，不得存在未消费的发布 intent 或变化的发布输入。缺少证据会阻止对应站点部署；无关包无需为更新该站点额外发版。

## 安装受管工作流

先升级到包含此能力的 repoctl，再审查并应用受管资产更新：

```bash
pnpm exec repo config validate
pnpm exec repo upgrade --dry-run --json
pnpm exec repo upgrade --yes
```

只有配置了 `commands.docs.sites`，升级才会添加 `repoctl-docs.yml`，用于 main 预览和手动调度。`repoctl-docs-deploy.yml` 本身不响应 push，仅作为预览、正式发布与重试共用的 reusable workflow。受管 Release 在稳定发布收尾完成后，将 `release-record` 和 `docs-sites` 输出交给它。已有自定义文档工作流会保留，需要显式迁移；以 upgrade 计划为准，不要假定已自动替换。

停用旧的“main 直接部署正式站”入口，以及托管平台中重复发布正式站的 Git 集成。每个通道只保留一个部署入口。共用工作流使用 `docs-<site>-<channel>` environment 和同名并发组，并关闭自动取消。Environment 是否需要批准由仓库现有设置决定，repoctl 不额外添加审批策略。

Cloudflare 部署沿用仓库或 environment 的 `CLOUDFLARE_API_TOKEN`、`CLOUDFLARE_ACCOUNT_ID`，account ID 也可使用 variable。核心命令不依赖特定托管平台。其他平台可以通过自定义工作流传入凭据，同时保留来源选择、部署命令和并发约定。

## 正式发布与首个基线

正式站以持久化的发布完成记录为起点。只有 npm 版本及 dist-tag 确认、Git tag、GitHub Release 元数据和必需的 release hooks 全部完成后，才会写入记录。创建了 Release PR 或准备任务成功，都不足以发布正式文档。记录包含准确包版本及原始提交，保存在 `repoctl-release-state` 分支；各站点的部署指针独立维护。

单包恢复不会创建正式文档基线。需要完成或重试原始完整发布批次，才能推进正式文档。

Release 运行的 `repoctl-ci-progress.json` 包含 `releaseRecord`，可用于手动部署或重试。部署计划也会返回 `releaseId`；修正已有正式站时可以省略。

接入后的首次正式部署，需要等待下一次完整稳定版发布。不能把当前 main 任意提交直接认作初始稳定基线。在该版本通过文档门禁前，现有正式部署继续提供服务。

每次部署均按原始提交的完整仓库与锁文件安装、构建；后续 main 提交不会进入正式构建。预览使用准确的 main SHA，并在部署前复核远端分支。旧来源不能覆盖已部署的新来源。

以下命令只检查计划，不安装依赖、不构建、不部署：

```bash
repo docs plan guide --channel preview --source-sha <完整-main-提交-SHA> --json
repo docs plan guide --channel stable --release <发布完成记录-ID> --json
```

计划使用 `schemaVersion: 1`，返回来源、包版本、选中的修正、部署身份、`eligible`、`skipped` 与 `blockers`。不满足条件时退出码为 1。读取已保存记录需要 GitHub 只读访问；本地应保留完整 Git 历史和最新的 `origin/main` 引用。

## 单独修正已发布文档

将独立的文档修正提交合入 main，然后在 Documentation 工作流的 `commits` 输入中填写其完整 SHA，选择对应站点和 `stable` 通道。省略 `release` 表示修正当前正式站，也可显式指定其发布完成记录。多个提交用空格分隔，按预期应用顺序填写。

先在本地检查：

```bash
repo docs plan guide --channel stable --commits <第一个-SHA> <第二个-SHA> --json
```

每个修正必须是已经进入 `origin/main` 历史的单父提交。其完整补丁只能包含配置允许的文档路径，以及支持的内容或静态资源扩展名。包清单、锁文件、工作流、脚本、发布 intents、agent 指引、可执行文件和符号链接均被排除。仍需按当前已发布行为审阅文案；路径检查无法判断文字描述的新功能是否已经存在。

repoctl 只把明确选中的补丁应用到稳定源码，不会从 main 复制整个目录。发生冲突时停止部署。已应用修正在重试时保留；后续稳定源码已经包含的修正，不会重复应用。

## 部署脚本约定与恢复

repoctl 在隔离源码目录内依次运行 `pnpm install --frozen-lockfile`、配置的构建脚本、所选部署脚本。构建与部署脚本均收到：

| 环境变量                               | 含义                                   |
| -------------------------------------- | -------------------------------------- |
| `REPO_DOCS_SITE` / `REPO_DOCS_CHANNEL` | 站点与 `preview` / `stable` 通道       |
| `REPO_DOCS_SOURCE_SHA`                 | 准确的源码提交                         |
| `REPO_DOCS_RELEASE_ID`                 | 稳定发布完成记录 ID；预览为空          |
| `REPO_DOCS_DEPLOYMENT_ID`              | 包含修正信息的确定性部署身份           |
| `REPO_DOCS_URL`                        | 可选的配置目标 URL                     |
| `REPO_DOCS_RESULT_FILE`                | 部署适配器核实平台结果后必须写入的文件 |

适配器须返回非空的平台版本 ID，并可附带 HTTP(S) URL：

```json
{ "versionId": "provider-deployment-version", "url": "https://docs.example.com" }
```

用 `REPO_DOCS_DEPLOYMENT_ID` 核对中断部署是否已完成，再决定是否重新上传。平台确认结果后才写入结果文件。进程退出码为零但没有有效结果文件，仍不算部署完成。

受管工作流先运行 `repo docs plan`，再以相同输入运行 `repo docs deploy`。正式部署要求 GitHub Actions、run ID，以及与实际串行并发组一致的 `REPO_DOCS_CONCURRENCY_GROUP`；本地审查使用 `plan`。构建或部署前先用 revision 比较并交换取得状态，平台结果确认后才推进已部署指针。

构建失败后，修复原因并针对相同发布记录重跑文档工作流，不会重新发布 npm。若正式站 runner 在部署期间消失，先重跑同一部署，让适配器核实平台结果；未解决的 `deploying` 操作不能被另一正式部署覆盖。预览站则允许串行的受管工作流用最新 main 来源替换中断的旧部署。已完成部署和无关联发布批次会跳过。保留 `repoctl-release-state` 分支；短期 Actions artifact 仅用于诊断，不能代替部署基线。

未完成的正式部署会保存站点配置、发布记录、请求的修正提交和已核验的源码树。重试时使用相同的发布记录和修正输入，计划器会重新核验保存的输入与部署标识，构建也使用保存的配置，即使 main 已修改配置或删除该站点。省略 `release` 时使用当前正式基线；首次部署还没有正式基线时，使用未完成部署的发布记录。若已有旧基线，而新版本部署尚未完成，必须明确指定新版本的发布记录。保存的状态损坏或不一致时，会在构建和上传前停止恢复。

如果修复需要修改产品源码或构建脚本，应发布新的稳定基线；相同发布记录始终使用原来的源码。

程序化 API 为 `planDocsDeployment(options)` 与 `deployDocs(options)`。`DocsOptions` 接受站点、通道、来源/发布/修正选择，以及可选配置、环境和 `DocsStateStore`。状态适配器需实现 `readAutomationState`、支持 revision 检查的 `writeAutomationState`、`readBranchHead`；查询失败必须抛出，不得假装没有历史状态。
