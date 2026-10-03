---
description: 说明 repoctl check 和 verify 的校验模式、pre-commit、staged typecheck、pre-push 与 commit-msg 链路。
---

# 运行校验

## 适用场景

提交、创建 pull request 或需要在本地复现 CI 计划前，使用这个任务。

## 前置条件

- 在 workspace 根目录运行 `repo doctor`。
- 使用仓库锁定的 pnpm 版本安装依赖。
- 先决定需要快速校验还是完整交付门禁。

## 最小命令

```bash
repo check --dry-run
```

## 预期输出

repoctl 会列出选中的任务和将要执行的确切命令。确认计划符合仓库策略后，再移除 `--dry-run`。

## 常见分支

- 只检查暂存文件：使用 `repo check --staged`。
- CI 需要产物：加入 `--json --out reports/check-plan.json`。
- 准备发布：快速校验通过后，再执行 `repo check --full`。

`repo check` 是给人使用的统一入口，`repo verify` 是给 hook、CI 和脚本复用的底层入口。

## 1. 模式速查

| 命令                                         | 模式         | 实际动作                                                       |
| -------------------------------------------- | ------------ | -------------------------------------------------------------- |
| `repo check`                                 | `default`    | 执行 `repo verify pre-commit`                                  |
| `repo check --staged`                        | `staged`     | 执行 pre-commit，并按 staged TypeScript/Vue 文件路由 typecheck |
| `repo check --full`                          | `full`       | 按根脚本执行 `lint`、`typecheck`、`test`、`build` 中存在的任务 |
| `repo check --edit-file .git/COMMIT_EDITMSG` | `commit-msg` | 执行 commit message 校验                                       |

预览模式不会真正执行校验：

```bash
repo check --dry-run
repo check --full --json --out reports/check-plan.json
repo check --markdown --redact --out reports/check-plan.md
```

## 2. pre-commit

`repo verify pre-commit` 默认执行 lint-staged。适合在提交前只处理 staged 文件，避免每次提交都跑整仓校验。

推荐的 lint-staged 行为包括：

| 文件类型                   | 推荐处理                                 |
| -------------------------- | ---------------------------------------- |
| JS、TS、Vue                | ESLint 自动修复                          |
| CSS、SCSS、Less、Vue style | Stylelint 自动修复                       |
| TS、TSX、MTS、CTS、Vue     | 路由到最近 workspace 的 `typecheck` 脚本 |

## 3. staged typecheck

`repo verify staged-typecheck <files...>` 会根据文件路径向上查找最近的 workspace，并执行该 workspace 的 `typecheck`。

```bash
repo verify staged-typecheck packages/ui/src/button.ts templates/client/src/App.vue
```

它解决的是 monorepo 里常见的问题：一个提交只改了某个包，不应该让所有 Vue 和 TypeScript workspace 都重复跑类型检查。

## 4. pre-push

`repo verify pre-push` 面向推送前的完整保护。默认策略是：

| 阶段         | 行为                                             |
| ------------ | ------------------------------------------------ |
| 根任务       | 强制执行整仓 `lint` 与 `typecheck`               |
| 变更范围任务 | 按 workspace 改动范围补跑 `build`、`test`、`tsd` |
| 失败处理     | 任一任务失败时停止并返回失败状态                 |

工作区默认从 `pnpm-workspace.yaml` 动态发现，包含 private 应用，遵循排除 glob；嵌套包按最长目录匹配，根包不会重复作为子包运行。每个包仅执行已有的 `build`、`test`、`tsd` 脚本。

删除文件仍会触发原所属包；文件跨包重命名时检查旧、新两个目录。根配置变化、已删除且无法归属的包清单会补跑根级 `build`、`test`、`tsd`。这是按文件归属选择，不会扩展反向依赖闭包。首次推送的 ref 与空树比较，删除 ref 不增加包级任务。

程序化 API 的 `workspaces` 参数继续支持覆盖自动发现，目录相对于 `cwd`，传入空数组也会生效；无需由调用方手动按目录深度排序。

如果 CI 想要更明确地复现整仓校验，可以使用：

```bash
repo check --full
```

## 5. commit message

`repo verify commit-msg <file>` 用于 Git 的 `commit-msg` hook。未配置自定义命令时，它会执行：

```bash
pnpm exec commitlint --edit <file>
```

如果你只是手动验证当前提交信息，可以运行：

```bash
repo check --edit-file .git/COMMIT_EDITMSG
```

## 6. 选择建议

| 场景               | 推荐命令                                          |
| ------------------ | ------------------------------------------------- |
| 本地提交前快速复现 | `repo check`                                      |
| lint-staged 调试   | `repo check --staged --dry-run`                   |
| 推送前完整检查     | `repo check --full`                               |
| CI 门禁            | `repo doctor --strict` 后接 `repo check --full`   |
| 只生成计划         | `repo check --json --out reports/check-plan.json` |

## 7. Affected 校验

```bash
repo check --affected --base origin/main --head HEAD --json
repo check --affected --base HEAD~1 --filter @acme/web --dry-run
repo check --affected --global-input 'shared-config/**'
repo check --affected --base origin/main --report reports/affected.json
```

affected 模式选择变更包及其直接、传递消费者，包含 private 应用。JSON schema version `1` 记录 Git 范围、文件归属、依赖路径、回退原因、包选择和任务跳过原因。可重复的 `--filter` 接受精确包名或 workspace 相对目录，与 affected 集合取交集。交集为空或缺少脚本时会明确说明，不会执行没有过滤条件的递归命令。

默认比较 `origin/main` 与 `HEAD` 的 merge base 到 `HEAD`，并纳入当前检出的暂存、未暂存和未跟踪文件。`--head` 必须指向当前 HEAD。引用缺失、浅克隆或历史不足、非当前 head、Git 不可用，以及 workspace 位于 Git 根目录下层时，都会明确全量回退。无法安全发现 workspace 时直接失败，不返回误导性的零影响计划。删除文件和跨包重命名两侧保留归属；包清单修改、新增或删除触发全量，因为依赖关系可能已经改变。

默认全局输入包括根 package/workspace/lock/Turbo 文件、TypeScript/lint/test/commit 配置、`.npmrc`、`.pnpmfile.*`、Node 版本文件、`.github/**`、`.husky/**`、`scripts/**` 和 `patches/**`。Turbo `globalDependencies` 与可重复的 `--global-input` glob 会追加到规则中。无法归属的未知文件也触发全量。根 Markdown、`docs/**` 和许可证/notice 文档默认忽略，但全局规则优先；workspace 包内文件仍属于该包输入。存在变更时，无法读取的 Turbo 配置或未解析图诊断（包括 catalog）也会保守全量回退。可在 JSON 的 `globalInputs`、`fallback` 中审查完整规则和原因。

执行顺序为 `build → lint → typecheck → tsd → test`，缺少脚本会跳过。pnpm recursive 接收精确计划过滤条件，由 pnpm 处理依赖顺序。build 还包含 affected/过滤集合以外的依赖，记录在 `prerequisiteTargets`，以便测试使用构建产物。全量回退优先执行对应根脚本；根脚本不存在时，改为运行全部选中包的对应脚本。显式过滤始终限制检查范围，包括回退时；build 前置依赖仍可能位于过滤集合之外。根脚本自行负责调用 Turbo/pnpm。

`--json`、`--markdown`、`--dry-run`、`--out` 仍然只预览。`--report` 执行同一模型并保存为 `affectedPlan`。`--affected` 不能与 `--full`、`--staged`、`--edit-file` 组合；base/head/filter/global-input 参数必须与 affected 模式一起使用。程序化调用可使用 `resolveAffectedCheckPlan({ cwd, base, head, filters, globalInputs })` 或 `runCheckWithReport({ cwd, affected: true, ... })`。

使用 `repo check --affected --matrix` 将同一计划导出为 GitHub Actions matrix，使用 `--shards 16` 分组。空结果处理和安全的参数数组执行方式见 [CI matrix 配置](/zh/tasks/ci#生成-affected-github-actions-matrix)。

## 8. 实际执行报告

```bash
repo check --full --report reports/check-result.json --redact
repo check --full --report reports/check-result.md --report-format markdown
```

`--report <file>` 会执行检查，把结果写入独立文件，终端继续显示实时日志。不能与 `--dry-run`、`--json`、`--markdown`、`--out` 混用；这四个已有选项仍然只生成计划。执行报告默认使用 JSON。

JSON 的 `schemaVersion` 为 `1`，包含模式、目录、开始与结束时间、毫秒耗时、退出码，以及逐项的实际 executable 和 args。状态固定为 `success`、`failed`、`skipped`、`interrupted`，不随语言变化。失败后停止后续任务，未执行任务的时间和退出码保留 null，并记录跳过原因。CLI 保留失败退出码；操作系统允许正常处理 SIGINT/SIGTERM 时，中断也会落盘。SIGKILL、断电或报告目录不可写时无法保证保存。

报告记录根脚本或 verify 阶段，不展开 Turbo、lint-staged 内部任务。staged 模式的类型检查由 pre-commit 中的 lint-staged 配置执行，单独的 staged-typecheck 没有显式文件参数，会标记为 skipped。报告不收集环境变量值和子进程输出；`--redact` 会替换目录及命令参数中的 workspace/home 路径前缀。

程序化 API `runCheckWithReport({ cwd, full: true, signal })` 返回同样的报告，不退出调用方进程；可传入 `AbortSignal` 取消正在执行的命令。

## 查找工作区可用任务

`repo workspace tasks` 列出 package.json 中实际存在的脚本，默认包含根级任务和 private 应用；没有脚本的包会明确标出。查询文本按名称、路径、说明和任务名进行字面匹配，`--script` 要求脚本名完全一致。发现与定位均不执行脚本、不写入文件。

```bash
repo workspace tasks client
repo workspace tasks --script test --json
repo workspace tasks --no-private --no-root
repo workspace locate @scope/client
repo workspace locate client --json
```

`locate` 将绝对目录路径（包括目录符号链接）作为精确查询，未指向工作区根目录的绝对路径不会回退成文本搜索。其他查询优先精确匹配包名或相对 workspace 的路径，再按名称、路径和说明搜索；即使从子包调用，相对路径和 `.` 仍相对于 workspace 根目录。唯一匹配只输出绝对路径；没有匹配或存在歧义时退出码为 1，并列出候选。`--interactive` 仅在 TTY 中允许选择，提示写入 stderr；JSON 和 CI 始终返回候选。把结果传给 shell 命令时应为路径加引号。

公共 `getWorkspaceTaskCatalog(cwd, options)` 和 `locateWorkspace(cwd, query)` API 返回 `schemaVersion: 1` 数据。目录提供稳定的排除原因，以及各任务原有脚本和 pnpm executable/args 数组（`--dir`、目录、`run`、任务名）。调用方可以显式执行该参数数组，继续使用 pnpm/Turbo 的行为；搜索本身不会启动任务。

## 逐包 Manifest 健康检查

`repo doctor` 按 pnpm workspace 匹配规则发现包，包含根包与 private 包，并逐个读取清单。一个 package.json 损坏时会生成独立诊断，其他包继续检查。兼容 pnpm 的 package.yaml 和 package.json5；同一目录存在多个清单时要求核查。每次 API 调用重新读取当前文件。

清单诊断复用 doctor 的 JSON、Markdown、`--strict` 和 `--redact` 输出，包含稳定的 `id`、相对工作区的 `path` 与字段 `field`。规则覆盖缺少/非法/重复包名、无效版本、依赖分区错误、缺失/歧义 workspace 目标、自依赖及重复/冲突声明。正常 peer/dev 和 peer/runtime 配对保留，peer 兼容检查独立处理。npm 允许 optionalDependencies 覆盖 dependencies，因此该重复仅警告。

不发布的应用应声明 `private: true`。公开包的 license、repository、repository.directory 和 publishConfig 建议只发出警告，不将推荐信息设为强制发布策略；strict 模式也会阻断警告。repository.directory 以 workspace 根目录比较，嵌套于其他 Git 仓库或单独托管的包需要人工核查。非法 JSON 中的值和 registry 凭据不会进入这些诊断。Doctor 不执行包脚本、不修改清单；实际 tarball 内容和类型消费兼容性由包交付检查负责。

## 内部依赖循环与架构边界

`repo workspace boundaries --json` 复用 manifest 依赖图，包含根包与 private 包。在 repoctl.config 中配置 `boundaries` 后，`repo doctor` 的 JSON/Markdown 和既有 CI 退出策略也会检查这些规则。独立命令在 fail 时退出 1，`--strict` 同时阻断 warn。不执行任务、不扫描源码 import、不改依赖、不检查第三方准入。

```ts
export default {
  boundaries: {
    tags: { shared: { paths: ['packages/**'] }, app: { paths: ['apps/**'] } },
    rules: [
      { id: 'shared-layer', from: { tags: ['shared'] }, allow: [{ tags: ['shared'] }] },
      { id: 'public-packages', from: { private: false }, allow: [{ private: false }] },
    ],
    cycles: { dependencyTypes: ['dependencies', 'optionalDependencies'], severity: 'fail' },
    exceptions: [
      { rule: 'shared-layer', source: 'packages/adapter', target: 'apps/web', type: 'peerDependencies', reason: 'Temporary adapter during migration' },
    ],
  },
}
```

选择器的不同字段取交集，同一字段的值取并集。`packages` 精确匹配包名；`paths` 只支持精确 workspace 目录（根为 `.`）或 `directory/**` 匹配后代，`./**` 匹配整个 workspace，不支持其他 glob。tag 是可重叠的命名选择器，不能递归引用 tag。规则的 `allow` 数组取并集，空数组明确禁止所有内部依赖，所有匹配的规则都生效。边界规则默认检查四类依赖；循环默认只检查 dependencies 和 optionalDependencies，可通过 dependencyTypes 纳入开发或 peer 边，`cycles: false` 关闭循环检查。semver 边仅表示潜在本地关系，不证明 lockfile 实际安装了本地包。

报告包含稳定规则 ID、manifest 字段、端点和具体边。每个存在环的强连通分量只报告一条稳定的闭合代表路径和完整成员列表，不枚举所有环。cycle 豁免只排除指定依赖类型的精确边，其余环仍检查；报告保留理由和已豁免的边。未知字段/tag、错误路径、重复 ID 或无理由豁免视为错误。无人匹配的选择器选项、失效豁免发出警告；内部依赖图无法完整解析时失败，不把未知关系判为健康。

公开 API `checkWorkspaceBoundaries(cwd, { config? })` 返回 schemaVersion 1、findings、exceptions 和 summary，显式 config 仅替换本次调用的项目配置。相对目录和规则 ID 不随输出语言变化。可把本命令或 `repo doctor --strict` 加入现有 pnpm CI 脚本，不增加任务执行层。

## 包负责人和 CODEOWNERS

在 `repoctl.config.ts` 中使用精确包名或工作区相对路径声明负责人：

```ts
export default {
  codeowners: { owners: { '@acme/web': ['@acme/frontend'], 'libraries/sdk': ['@maintainer'] } },
}
```

`repoctl workspace owners [workspace] --json` 显示公有/私有包、负责人、配置来源和缺失归属。支持 GitHub 用户、团队及邮箱；本地只做文本校验，真实成员身份、访问和 review 权限由 GitHub 管理。

```sh
repoctl workspace owners --file .github/CODEOWNERS --dry-run
repoctl workspace owners --file .github/CODEOWNERS --sync
```

必须显式选择工作区根目录下的 `.github/CODEOWNERS`、`CODEOWNERS` 或 `docs/CODEOWNERS`。根包可以通过 `.` 或根包名配置，其 `*` 默认规则先于更具体的子包规则生成。默认只读预览；即使同时传入 `--sync`，`--dry-run` 仍不写入。受管块外的规则、注释及顺序逐字保留。GitHub 使用最后匹配规则，后续可能覆盖包目录或子路径的规则（含无 owner 规则）会得到诊断；更高优先级的 CODEOWNERS 文件也会提示。无法安全表达的目录字符和非法映射会阻止同步。

公开 `planCodeowners()` / `applyCodeownersPlan()` 提供前后内容和 diff；应用时重新校验配置、工作区发现和文件内容，过期计划会被拒绝。单文件原子替换、拒绝符号链接和硬链接目标，重跑不产生额外变更。不发送消息、不请求 review、不修改权限或分支保护。

## 受管资产升级 PR

可信默认分支更新依赖后，运行 `repo maintenance upgrade --base <升级前完整SHA> --head <当前完整SHA> --out <仓库外空目录>`，比较 pnpm 锁文件中**根依赖** `repoctl` 的精确解析版本。支持 pnpm 12 独立的包管理器文档；无关依赖和 peer 上下文变化不会触发升级；不支持或有歧义的解析会阻断。目标版本必须已通过 frozen lockfile 安装。

准备步骤应在一次性干净 checkout 中运行：应用完整根资产计划和三方合并，由 pnpm 更新锁文件，再执行 `--frozen-lockfile --ignore-scripts` 安装，随后按 build、lint、typecheck、tsd、test 顺序执行已声明的根脚本。生成的变更保留在该 checkout。冲突、源码漂移、不支持的路径和校验失败会留下 `blocked` 报告及日志；没有资产 diff 时为 `unchanged`，这两种状态均不创建 PR。报告包含逐文件计划、跳过/冲突项、来源/目标版本、检查结果、精确文件哈希与模式、补丁摘要。

通过 `repo maintenance workflow --out .github/workflows/repoctl-upgrade.yml` 导出需主动启用的工作流，已有文件不会被覆盖。配置仓库 GitHub App 的 `REPOCTL_APP_CLIENT_ID`、`REPOCTL_APP_PRIVATE_KEY`，授予 **Contents、Pull requests、Workflows 写权限**，随后提交工作流。Workflows 权限用于更新受管工作流；App token 也能让新 PR 正常触发 CI。不需要 registry token。

第一个 job 仅有读取权限，可以运行可信 checkout 的配置、依赖和检查脚本，上传不可变产物。第二个 job 只下载精确 artifact ID，核验摘要、本次 run/attempt/仓库、源码 SHA、根资产路径、Git 文件模式和前后哈希，然后应用已审核补丁。它不执行项目脚本或已安装依赖，校验完成后才获取 App token，通过固定 SHA 的 `create-pull-request` action 管理专用 `repoctl/managed-assets` 分支。重复事件更新同一分支和 PR，请勿在该分支维护手工修改。默认分支推进或 App 权限缺失/不足会阻止发布；完整报告仍保留在 workflow artifact 中。

仅支持默认分支上触及 `pnpm-lock.yaml` 的 push，以及在默认分支显式手工运行；重试时填写依赖升级前的完整可信祖先 SHA。并发按仓库/默认分支串行。不处理 fork PR 事件，不自动合并或发布 npm 包，也不扩展为任意依赖机器人、组织资产提供者或模板实例升级器。

## 诊断 Turbo 缓存未命中与慢任务

通过 Turbo 既有的 `pnpm exec turbo run build --summarize` 保存证据，再显式选择摘要文件分析。分析命令不启动任务、不删除缓存、不修改配置：

```sh
repo check cache .turbo/runs/current.json
repo check cache .turbo/runs/current.json .turbo/runs/previous.json --json
repo check cache current.json previous.json --markdown > cache-analysis.md
```

`--slowest 10` 支持 1–100 个慢任务。JSON schemaVersion 为 1，包含已知命中、未命中、未知缓存结果，以已知结果为分母计算命中率；记录实际任务耗时、耗时差异，按稳定 task ID 比较并标明新增与删除。缺失/重复 ID、缺失字段和不支持的摘要 schema 都会报告限制，不把信息缺失解释为输入已被删除。支持原生 Turbo summary schema 1，并包含真实 Turbo 2.11.6 fixture；未来 schema 仅保留可读取的粗粒度记录，比较结果标为 unknown。

共享全局差异只在 `globalEvidence` 保存一次，任务仅保留自身证据，避免报告随任务数与全局文件数相乘膨胀。比较证据覆盖文件、全局输入、依赖任务 hash、环境声明/值、命令/参数及最终任务配置。所有值（包括输入中的 hash）先转为 SHA-256 摘要再输出，标签仅保留任务 ID、文件名、环境变量名和允许的字段名；不输出原始环境值、命令或任意配置。摘要相同只表示证据相同，不足以断定未命中的唯一原因；hash 不变仍未命中、hash 变化却无细节证据时都有明确限制。报告不包含输入摘要路径。

只有任务标识唯一、依赖完整、时间有效、图无环且前置任务没有与消费者执行重叠时才计算关键路径。任务耗时之和与实测跨度分开呈现，调度空隙和竞争等开销意味着它不等于可节省的实际运行时间。输入限 20 MiB JSON 文件、嵌套深度 64。分析只读，可重定向 stdout 留档；拒绝父命令的执行和计划写入选项（`--full`、`--affected`、`--report`、`--out` 等）。`--json`、`--markdown`、`--dry-run` 可以放在 `cache` 前后；普通 `check --json` 保持计划预览语义。

公开 API `analyzeTurboRuns(currentPath, { previous?: string, slowest?: number })` 返回 `TurboRunAnalysis`，不修改文件。JSON 字段和限制代码不随语言变化。
