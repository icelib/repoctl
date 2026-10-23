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

## 使用内置 Cloudflare Workers provider

纯静态资源 Worker 可以将站点的 `preview` 和 `stable` 脚本目标替换为原生目标：

```ts
const cloudflare = {
  provider: 'cloudflare-workers' as const,
  config: 'website/wrangler.jsonc',
  accountId: '0123456789abcdef0123456789abcdef',
}

const targets = {
  preview: {
    ...cloudflare,
    workerName: 'docs-site-preview',
    environment: 'preview',
    url: 'https://next.example.com',
  },
  stable: {
    ...cloudflare,
    workerName: 'docs-site',
    url: 'https://docs.example.com',
  },
}
```

站点仍保留原有 `buildScript`、`packages`、`releaseInputs` 和 `patchPaths`。每个目标选择 `deployScript` 或 `provider: 'cloudflare-workers'`，两者不能混用。已有脚本目标无需补充 discriminator 或默认值，其他平台和自定义 Cloudflare 部署仍可使用脚本适配器。

使用已提交、仓库相对路径的 JSON 或 JSONC Wrangler 配置，例如 `website/wrangler.jsonc`：

```jsonc
{
  "name": "docs-site",
  "account_id": "0123456789abcdef0123456789abcdef",
  "compatibility_date": "2026-10-01",
  "workers_dev": false,
  "preview_urls": false,
  "assets": { "directory": "dist" },
  "routes": [{ "pattern": "docs.example.com", "custom_domain": true }],
  "env": {
    "preview": {
      "name": "docs-site-preview",
      "routes": [{ "pattern": "next.example.com", "custom_domain": true }]
    }
  }
}
```

`workerName` 和 `accountId` 用于校验解析后的部署身份，不会静默改写 Wrangler 配置。省略 `environment` 表示顶层环境。具名环境必须存在；显式 `name` 优先，否则 Wrangler 在顶层 Worker 名后追加环境名。环境内的 `assets` 对象会整体替换顶层对象，所以局部覆盖也必须包含 `directory`。输出路径相对于 Wrangler 文件解析，且解析符号链接后仍须位于冻结源码目录内。

顶层已有路由时，具名环境必须显式配置自己的路由。预览与正式目标不能使用同一账户中的同名 Worker，即使环境名不同；也不能接管对方的自定义域名。配置的 `url` 必须与所选目标一致。示例使用自定义域名路由，无法明确判断归属的路由会被拒绝。

原生 provider 只接受有限的静态配置：JSON/JSONC、纯静态资源 Worker，以及支持的自定义域名路由。TOML、自动生成或插件选择的配置、Worker 代码（`main`）、自定义 build、bindings、service environments、资源自动创建和其他未支持选项，应使用 `deployScript` 适配器。在对应工作区声明 Wrangler 开发依赖并提交锁文件；repoctl 使用已安装的 CLI，不在部署时临时下载。

`deploy` 会先对冻结配置执行原生预检，再安装该源码目录的依赖和运行构建。预检核对凭据、账户/Worker/配置身份、路径，以及 Cloudflare 部署和版本接口的只读响应。运行时提供 `CLOUDFLARE_API_TOKEN`；非秘密的 `accountId` 固定在站点目标中，环境变量 `CLOUDFLARE_ACCOUNT_ID` 或有效的 Wrangler `account_id` 如有配置，必须与其一致。读取成功只能证明能够访问已查询的资源，不能证明后续上传或域名更新的权限；token 仍需具备所选 Worker 和域名操作需要的写权限。部署身份不会保存 token。

只有明确的 Worker 不存在响应，即 HTTP 404 且 Cloudflare 错误码为 `10007`，才允许首次上传。认证错误、普通 404、限流、异常响应和空部署列表都会停止部署。`repo docs plan` 仍只检查源码与发布证据，不执行该凭据预检，也不证明平台访问权限。

构建后，repoctl 再次核对配置与输出路径，并在静态资源中写入 `/.well-known/repoctl-deployment.json`，记录站点、通道、部署 ID、源码/tree SHA 和可选发布记录 ID。该路径已有文件时，必须是完整身份相同的有效 manifest；冲突 manifest 或无关用户文件会使部署失败，不会被覆盖。Cloudflare 确认要求最新生效部署只有一个版本承接 100% 流量，并带有 `repoctl-docs:<deploymentId>` 注解。这里确认的是平台状态；启用下述可选 readiness 门禁后，才会继续核验公网 HTTP 交付。

## 公网交付验证后再推进 current

在任一目标中添加 `readiness: {}`，即可要求平台确认后继续验证公网交付。省略 `readiness` 时保留原有行为，不发起公网 HTTP 请求。启用后必须显式配置 HTTPS `url`，且不得带凭据、query 或 fragment。URL 可以带路径，但 manifest 始终从 origin 根路径 `/.well-known/repoctl-deployment.json` 读取。使用共享 Nimbus 或 VitePress 渠道 helper 时，目标 `url` 应为不带路径的 origin，站点前缀单独通过框架 `base` 配置；repoctl 会将该 URL 原样传入 `REPO_DOCS_URL`。

```ts
const readiness = {
  timeoutMs: 120000,
  requestTimeoutMs: 10000,
}
```

两个选项均为正整数。`timeoutMs` 默认 120000，范围为 1–600000 ms；`requestTimeoutMs` 默认 10000，范围为 1–30000 ms。每次重试获得新的有限预算。请求与响应体读取均有时间限制，拒绝重定向、绕过缓存，且不会向公网 URL 发送平台凭据。成功响应必须包含完全一致的 schema、站点、通道、部署 ID、源码/tree SHA 与正式发布记录 ID；旧页面或仅有 HTTP 200 均不足以通过。

原生 provider 在构建后写入身份 manifest。启用此功能的脚本目标需在最终静态产物中生成相同 JSON：`schemaVersion: 1`，并将 `REPO_DOCS_SITE`、`REPO_DOCS_CHANNEL`、`REPO_DOCS_DEPLOYMENT_ID`、`REPO_DOCS_SOURCE_SHA`、`REPO_DOCS_TREE_SHA` 分别写为 `site`、`channel`、`deploymentId`、`sourceSha`、`treeSha`。仅正式通道从 `REPO_DOCS_RELEASE_ID` 写入 `releaseId`。直接使用已包含所选修正的 tree SHA，保留 Nimbus `_headers` 等无关生成文件。manifest 必须可公开访问，无需认证。

平台结果保存后，状态先从 `deploying` 转为 `verifying`，再发起首个公网请求。超时或最终写入失败时保留该 receipt，以及此前已完整验证的 `current` 指针。此时公网流量可能已经切换到新版本，但 `current` 尚未推进。

以相同输入重试可直接恢复验证，无需重新安装、构建或上传冻结源码。原生目标会在轮询前及最终写入前再次确认保存的同一版本仍然生效；脚本目标复用 receipt，不再次运行 `deployScript`。远端变为其他版本、混合流量或身份改变时直接失败，不会自动转为上传。共用工作流仍会安装根依赖来启动 repoctl。正式重试保留已保存的 readiness 策略与 URL，即使 main 修改或删除它们；未解决的 `verifying` 操作也不能被另一正式部署替换。

## 安装受管工作流

先升级到包含此能力的 repoctl，再审查并应用受管资产更新：

```bash
pnpm exec repo config validate
pnpm exec repo upgrade --dry-run --json
pnpm exec repo upgrade --yes
```

只有配置了 `commands.docs.sites`，升级才会添加 `repoctl-docs.yml`，用于 main 预览和手动调度。`repoctl-docs-deploy.yml` 本身不响应 push，仅作为预览、正式发布与重试共用的 reusable workflow。受管 Release 在稳定发布收尾完成后，将 `release-record` 和 `docs-sites` 输出交给它。已有自定义文档工作流会保留，需要显式迁移；以 upgrade 计划为准，不要假定已自动替换。

停用旧的“main 直接部署正式站”入口，以及托管平台中重复发布正式站的 Git 集成。每个通道只保留一个部署入口。共用工作流使用 `docs-<site>-<channel>` environment 和同名并发组，并关闭自动取消。Environment 是否需要批准由仓库现有设置决定，repoctl 不额外添加审批策略。

Cloudflare 部署通过仓库或 environment 的 secret 提供 `CLOUDFLARE_API_TOKEN`。受管工作流也会从 secret 或 variable 传入 `CLOUDFLARE_ACCOUNT_ID`；原生目标要求它与配置的 `accountId` 一致。其他平台使用部署脚本，可通过自定义工作流传入凭据，同时保留来源选择、部署命令和并发约定。

## 正式发布与首个基线

正式站以持久化的发布完成记录为起点。只有 npm 版本及 dist-tag 确认、Git tag、GitHub Release 元数据和必需的 release hooks 全部完成后，才会写入记录。创建了 Release PR 或准备任务成功，都不足以发布正式文档。记录包含准确包版本及原始提交，保存在 `repoctl-release-state` 分支；各站点的部署指针独立维护。

单包恢复不会创建正式文档基线。需要完成或重试原始完整发布批次，才能推进正式文档。

Release 运行的 `repoctl-ci-progress.json` 包含 `releaseRecord`，可用于手动部署或重试。部署计划也会返回 `releaseId`；修正已有正式站时可以省略。

接入后的首次正式部署，需要等待下一次完整稳定版发布。不能把当前 main 任意提交直接认作初始稳定基线。在该版本通过文档门禁前，现有正式部署继续提供服务。

全新部署按原始提交的完整仓库与锁文件安装、构建；已保存验证结果的重试复用平台 receipt；后续 main 提交不会进入正式构建。预览使用准确的 main SHA，并在部署前复核远端分支。旧来源不能覆盖已部署的新来源。

以下命令只检查计划，不安装依赖、不构建、不部署：

```bash
repo docs plan guide --channel preview --source-sha <完整-main-提交-SHA> --json
repo docs plan guide --channel stable --release <发布完成记录-ID> --json
```

计划使用 `schemaVersion: 1`，返回来源、包版本、选中的修正、部署身份、`eligible`、`skipped` 与 `blockers`。不满足条件时退出码为 1。读取已保存记录需要 GitHub 只读访问；本地应保留完整 Git 历史和最新的 `origin/main` 引用。

## 单独修正已发布文档

将独立的文档修正提交合入 main，然后在 Documentation 工作流的 `commits` 输入中填写其完整 SHA，选择对应站点和 `stable` 通道。省略 `release` 表示修正当前正式站，也可显式指定其发布完成记录。多个提交用空格分隔，按预期应用顺序填写。

未发布任何站点关联包的发布记录不能作为修正基线；为这类记录选择修正提交会阻断部署。省略 `release`，即可把选中的补丁应用到当前正式基线。真正关联站点的新稳定发布仍可保留已有修正，并应用新选中的补丁。

先在本地检查：

```bash
repo docs plan guide --channel stable --commits <第一个-SHA> <第二个-SHA> --json
```

每个修正必须是已经进入 `origin/main` 历史的单父提交。其完整补丁只能包含配置允许的文档路径，以及支持的内容或静态资源扩展名。包清单、锁文件、工作流、脚本、发布 intents、agent 指引、可执行文件和符号链接均被排除。仍需按当前已发布行为审阅文案；路径检查无法判断文字描述的新功能是否已经存在。

repoctl 只把明确选中的补丁应用到稳定源码，不会从 main 复制整个目录。发生冲突时停止部署。已应用修正在重试时保留；后续稳定源码已经包含的修正，不会重复应用。

## 部署适配器与恢复

repoctl 在隔离源码目录内运行 `pnpm install --frozen-lockfile` 和配置的构建脚本，再调用所选原生 provider 或部署脚本。原生目标会先执行前述预检。构建脚本和部署脚本均收到：

| 环境变量                               | 含义                                   |
| -------------------------------------- | -------------------------------------- |
| `REPO_DOCS_SITE` / `REPO_DOCS_CHANNEL` | 站点与 `preview` / `stable` 通道       |
| `REPO_DOCS_SOURCE_SHA`                 | 准确的源码提交                         |
| `REPO_DOCS_TREE_SHA`                   | 包含所选文档修正的已核验源码树         |
| `REPO_DOCS_RELEASE_ID`                 | 稳定发布完成记录 ID；预览为空          |
| `REPO_DOCS_DEPLOYMENT_ID`              | 包含修正信息的确定性部署身份           |
| `REPO_DOCS_URL`                        | 可选的配置目标 URL                     |
| `REPO_DOCS_RESULT_FILE`                | 脚本适配器核实平台结果后必须写入的文件 |

脚本适配器须写入非空的平台版本 ID，并可附带 HTTP(S) URL。原生 provider 直接返回该结果，无需部署脚本或自行写入结果文件：

```json
{ "versionId": "provider-deployment-version", "url": "https://docs.example.com" }
```

用 `REPO_DOCS_DEPLOYMENT_ID` 核对中断部署是否已完成，再决定是否重新上传。平台确认结果后才写入结果文件。进程退出码为零但没有有效结果文件，仍不算部署完成。启用 readiness 后，保存的 receipt 仅接受 `versionId` 和可选 `url`；版本 ID 必须非空、不超过 512 字符且无控制字符，HTTP(S) URL 不得包含凭据、query 或 fragment。

原生 Cloudflare provider 自行执行上述核对。当前生效版本的注解相同且承接 100% 流量时，复用该版本，不再上传；历史版本匹配不足以恢复，混合流量也会失败。有效的当前版本属于其他部署时，允许本次已授权的新部署上传。Wrangler 返回的 Worker、环境和版本必须匹配目标，且该版本确认已生效后才推进 current 指针。

受管工作流先运行 `repo docs plan`，再以相同输入运行 `repo docs deploy`。正式部署要求 GitHub Actions、run ID，以及与实际串行并发组一致的 `REPO_DOCS_CONCURRENCY_GROUP`；本地审查使用 `plan`。构建或部署前先用 revision 比较并交换取得状态，平台结果确认后才推进已部署指针。

构建失败后，修复原因并针对相同发布记录重跑文档工作流，不会重新发布 npm。若正式站 runner 在部署期间消失，先重跑同一部署，让适配器核实平台结果；未解决的 `deploying` 或 `verifying` 操作不能被另一正式部署覆盖。预览站则允许串行的受管工作流用最新 main 来源替换中断的旧部署。已完成部署和无关联发布批次会跳过。保留 `repoctl-release-state` 分支；短期 Actions artifact 仅用于诊断，不能代替部署基线。

未完成的正式部署会保存站点配置、发布记录、请求的修正提交和已核验的源码树。重试时使用相同的发布记录和修正输入，计划器会重新核验保存的输入与部署标识，构建也使用保存的配置，即使 main 已修改配置或删除该站点。省略 `release` 时使用当前正式基线；首次部署还没有正式基线时，使用未完成部署的发布记录。若已有旧基线，而新版本部署尚未完成，必须明确指定新版本的发布记录。保存的状态损坏或不一致时，会在构建和上传前停止恢复。

上传成功但结果尚未持久化为验证 receipt，或未启用 readiness 且最终写入失败时，保留 `deploying` 状态。重试仍会安装和构建同一份冻结源码，再查询远端生效版本以决定是否上传。重试中的预检或构建失败，不会清除这个结果未知的上传状态。即使当前配置已切换到原生 provider，旧的未完成脚本部署仍使用保存的脚本目标和原始源码恢复；迁移后续部署时不要改写历史快照。

如果修复需要修改产品源码或构建脚本，应发布新的稳定基线；相同发布记录始终使用原来的源码。

repoctl 已知失败保留固定原因码和处理建议，包括缺少凭据、平台身份冲突、不支持的配置、已保存版本不再生效、状态认领变化以及 main 已前进。未知异常只保留阶段分类，不复制其原始 message 或 cause。

程序化 API 为 `planDocsDeployment(options)` 与 `deployDocs(options)`。`DocsOptions` 接受站点、通道、来源/发布/修正选择，以及可选配置、环境和 `DocsStateStore`。状态适配器需实现 `readAutomationState`、支持 revision 检查的 `writeAutomationState`、`readBranchHead`；可选 `fetch` 提供原生 provider 与公网 readiness 的 HTTP transport，`spawn` 提供进程 transport。查询失败必须抛出，不得假装没有历史状态。公开目标类型为 `DocsScriptDeploymentTarget`、`DocsCloudflareWorkersTarget` 及其联合类型 `DocsDeploymentTarget`。

## 部署报告

`deployDocs()` 的已部署和跳过结果包含可选 `report`。失败时抛出公开的 `DocsDeploymentError`，其 `report` 为安全的结构化失败结果。`DocsDeploymentReport` 包含本次时间戳与单调时钟耗时（毫秒），按顺序记录 `plan`、`preflight`、`install`、`build`、`provider`、`readiness`、`finalize`；每阶段明确标记 completed/skipped/failed、安全原因码，平台操作区分 `upload`/`reconcile`，并记录已知部署/版本 ID。失败包含 `failedStage`，可恢复时附带 `deploying` 或 `verifying` 的 `resumablePhase`。恢复时复用的安装和构建阶段标为跳过，不伪装成零耗时执行成功。

`repo docs deploy ... --json` 的 stdout 仅输出结果或安全失败报告，失败退出码非零。安装、构建和脚本日志仍实时输出，JSON 模式下转到 stderr；程序化调用可设置 `DocsOptions.json` 使用相同传输方式。普通 CLI 模式另在 stderr 输出安全失败提示。repoctl 生成的报告和错误不会包含原始异常、HTTP 响应体或凭据；部署脚本仍需自行管理终端日志，repoctl 不承诺脱敏任意脚本输出。

成功、跳过和失败均向 `GITHUB_STEP_SUMMARY` 写入同一阶段报告，转义文字并提供重试说明。摘要写入失败仅增加 `warnings: ['summary-write-failed']`，不会改变部署结果、回滚 current 或掩盖主要错误。报告只描述本次调用，不虚构跨重试的累计耗时。

## 构建渠道上下文

Nimbus 和 VitePress 使用轻量入口 `repoctl/docs-context`。在站点的 deployment 模块中配置不同的预览与正式 origin：Nimbus 使用 `src/lib/deployment.ts`，VitePress 使用 `.vitepress/deployment/index.ts`。仅在框架构建边界读取公开输入：

```ts
import { resolveDocsContext } from 'repoctl/docs-context'

const context = resolveDocsContext({
  channel: process.env.REPO_DOCS_CHANNEL,
  url: process.env.REPO_DOCS_URL,
  previewOrigin: 'https://next.example.com',
  stableOrigin: 'https://docs.example.com',
})
```

未设置或空渠道默认为 `preview`，未知渠道会失败。两个 origin 必须不同，且必须是没有凭据、路径、查询和片段的 HTTP(S) origin；根路径末尾斜杠会规范化。子路径部署单独设置框架 `base`。提供非空 `REPO_DOCS_URL` 时，它必须与渠道配置的 origin 一致。helper 不读取凭据、GitHub 状态或发布记录，下面两种本地构建均不需要部署授权：

```sh
REPO_DOCS_CHANNEL=preview pnpm build
REPO_DOCS_CHANNEL=stable pnpm build
```

`resolveDocsContext(options)` 返回包含 `channel`、`preview`、`origin`、`stableOrigin` 的 `DocsContext`，同时导出 `DocsChannel` 和 `DocsContextOptions`。`docsPreviewRobots`、`docsRobots(context, sitemapUrl?)`、`mergeDocsHeaders(existing, context)` 提供公共爬虫策略。正式 sitemap 默认为 `<origin>/sitemap.xml`，Nimbus 传入自己的 `sitemap-index.xml` URL。核心包的 `@icebreakers/monorepo/docs-context` 提供相同纯 API，不加载 CLI、文件系统或部署 provider。

预览 origin 统一用于 canonical、hreflang、社交/结构化 URL，以及 Nimbus 的 Markdown、LLM 和发现导出。预览站显示未发布提示并链接正式站，输出 `noindex, nofollow, noarchive`、robots.txt 全站禁止策略，以及带归属标记的等效 X-Robots-Tag。本地搜索继续建立索引。页面原本声明的 `noindex` 在正式站继续生效；Nimbus 独立遵守显式 `searchable: true`。爬虫指令不是访问控制。

`mergeDocsHeaders` 保留用户与 Nimbus 的响应头，优先在已有通配规则内插入带标记的预览字段，正式构建只移除自身字段。归属标记损坏会让构建失败。Nimbus 在发现集成之后合并，VitePress 在 buildEnd 中执行。重复构建通过框架清理输出，避免遗留另一个渠道的产物。

模板在 build、lint、typecheck 和 test 的任务级 Turbo `env` 中声明 `REPO_DOCS_CHANNEL`、`REPO_DOCS_URL`，Markdown、框架配置和验证脚本均参与缓存。保持这些值进入 hash，不要只声明 passthrough；用 `repo env check build lint typecheck test --json` 检查。文档工作区需要在 devDependencies 中声明 `repoctl`，以便冻结构建能使用 helper。已有自定义布局继续保留：手动接入这些部分，或审查 `repo templates upgrade` 计划；不要假定根目录的 `repo upgrade` 会重写布局。
