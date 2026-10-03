# 模板与创建

repoctl 的模板由 `@icebreakers/monorepo-templates` 维护。CLI、脚手架和文档都复用同一份模板元数据。

更偏维护者视角的模板元数据、健康检查和自定义模板说明见：[模板资产治理](/zh/reference/template-assets)。

## 内置模板

| Key           | Category | 默认目录             | 适合场景                             |
| ------------- | -------- | -------------------- | ------------------------------------ |
| `tsdown`      | library  | `packages/tsdown`    | TypeScript 库包                      |
| `vue-lib`     | library  | `packages/vue-lib`   | Vue 3 组件库                         |
| `vue-hono`    | app      | `apps/client`        | Vue 3 + Hono 前后端一体应用          |
| `react-vite`  | app      | `apps/react-vite`    | React + Vite + TypeScript 单页应用   |
| `react-lib`   | library  | `packages/react-lib` | 含类型声明和 CSS 出口的 React 组件库 |
| `hono-server` | service  | `apps/server`        | Hono API 服务                        |
| `vitepress`   | docs     | `apps/website`       | VitePress 文档站                     |
| `nimbus`      | docs     | `apps/docs`          | Nimbus + Astro，默认中英双语文档     |
| `cli`         | tool     | `apps/cli`           | TypeScript 命令行工具                |

Nimbus 是新建文档站点（`Docs Site`）的默认模板，提供英文 `/`、中文 `/zh/`、搜索和 AI 文档入口。VitePress 仍可显式选择，两者分别生成到 `apps/docs` 和 `apps/website`，可以同时使用。通用创建命令仍默认使用 `tsdown`；项目名称 `docs` 不会隐式改变模板。非交互调用请显式指定 `--template nimbus`。

## 查看模板

```bash
repo templates
repo templates tsdown
repo templates --category library
repo templates --json
repo templates --markdown --out docs/templates.md
```

## 发现自定义模板

在 `commands.create.templateMap` 声明本地模板后，创建、交互选择、列表、详情和健康检查会使用同一份目录结果，包含 key、名称、说明、分类、源目录和默认目标。

```ts
import { fileURLToPath } from 'node:url'
import { defineMonorepoConfig } from 'repoctl'

export default defineMonorepoConfig({
  commands: {
    create: {
      templateMap: {
        'internal-service': {
          source: fileURLToPath(new URL('./templates/internal-service', import.meta.url)),
          target: 'apps/internal-service',
          label: 'Internal service',
          category: 'service',
          description: 'Company API service',
        },
      },
    },
  },
})
```

```bash
repo templates internal-service --json
repo templates --check --json
repo new payments --template internal-service --dry-run
```

绝对 `source` 路径可让内置模板和本地模板同时可用。相对 `source` 按 `templatesDir` 解析；默认根目录是已安装模板包。设置 `templatesDir: './templates'` 会替换所有模板（包括内置模板）的根目录，相对路径按配置文件所在目录解析。从 pnpm 子包目录运行时会查找工作区根配置，不会把模板路径移到子包内；生成目标仍按调用目录解析。

字符串映射保持兼容：`templateMap: { custom: 'custom' }` 等价于 `{ source: 'custom', target: 'custom' }`。对象定义可补充 `label`、`description`、`category`。非空 `choices` 数组继续控制交互顺序和可选范围，其名称与说明也会显示在列表和详情中；未配置时列出全部模板。内置创建意图的默认模板不变；登记自定义模板后交互会直接展示模板目录。

同名覆盖通过 `origin: 'custom'`、`overridesBuiltin: true` 及 `configFile` / `configPath` 显示。无效定义和重复交互 key 会定位到配置字段；`repo templates --check` 还会检查重复 source/target、失效目录和缺失 `package.json`。列表 JSON 仍为数组、详情 JSON 仍为对象，只增加目录字段；创建 JSON 的 `templateInfo` 携带所选模板的相同信息。

列表与健康检查只读取声明和文件，不生成项目，也不执行模板代码；显式 `--out` 才写出报告。程序调用可使用 `resolveTemplateCatalog({ cwd })` 和 `checkTemplates({ cwd })`。

## 创建模板

```bash
repo new sdk --template tsdown
repo new ui --template vue-lib
repo new api --template hono-server
repo new docs --template nimbus
repo new website --template vitepress
repo new toolbox --template cli
```

普通名字会自动放到模板约定的目录里，例如库包进入 `packages/`，应用进入 `apps/`。如果你传入带 `/` 的路径，例如 `packages/shared-utils`，repoctl 会尊重这个路径。

## 按目标选择模板

### 要发布 npm 库

```bash
repo new sdk --template tsdown
```

生成后先检查：

- `package.json` 的 `name`、`exports`、`types`。
- `tsdown.config.ts` 是否符合产物格式。
- 是否需要补 `tsd` 类型测试。

### 要沉淀 Vue 组件

```bash
repo new ui --template vue-lib
```

生成后先检查：

- 组件入口是否只导出稳定 API。
- 样式是否能通过 Stylelint。
- 文档站或示例应用是否需要同步创建。

### 要创建应用或服务

```bash
repo new web --template vue-hono
repo new dashboard --template react-vite
repo new api --template hono-server
```

生成后先检查：

- 运行时环境变量和部署平台约束。
- `dev`、`build`、`typecheck` 脚本是否接入根任务。
- 是否需要在 CI 里加入 E2E 或集成测试。

### React 应用

```bash
pnpm create repoctl@latest my-workspace -- --yes --templates react-vite,tsdown
cd my-workspace
corepack enable
pnpm install
pnpm build
pnpm lint
pnpm typecheck
pnpm test
pnpm --dir apps/react-vite preview
```

已有工作区可运行 `repo new dashboard --template react-vite`。交互式 **Web App** 会提供 React + Vite 与 Vue + Hono 选择。目标目录已存在时创建会失败，不会覆盖；先传 `--dry-run` 可检查创建计划。

模板包含支持键盘操作的计数器、React Testing Library/Vitest 测试、共享 ESLint/Stylelint 配置和 TypeScript 项目引用，不默认绑定路由、状态管理、后端或 CSS 框架。消费本地库时将其声明为 `workspace:*` 依赖，通过包名导入，再由根目录 `pnpm build` 按依赖顺序构建其 `dist` 公开产物；不要直接导入库源码路径。`preview` 使用正式构建产物。

### Cloudflare Worker 类型

`vue-hono` 和 `hono-server` 模板会在 `dev`、`build`、`typecheck` 前，根据已安装的 Wrangler 版本和 `wrangler.jsonc` 自动生成 `worker-configuration.d.ts`。该文件由 Git 忽略，也不会打入发布的模板包；依赖升级无需再提交重新生成的声明。

修改 binding 或兼容性配置后，可在应用工作区运行 `pnpm cf-typegen` 刷新编辑器类型。`pnpm cf-typegen:check` 保留为只读诊断命令，文件缺失或过期时会报错。构建和类型检查会自动重新生成，配置错误和真实 TypeScript 错误仍会阻止通过。

已有项目需同步这些脚本和 Turbo 的输入、输出配置，再执行 `git rm --cached worker-configuration.d.ts` 移除 Git 跟踪，并将文件加入 `.gitignore`。

### 要创建文档站

```bash
repo new docs --template nimbus
```

生成后先检查：

- 导航和 sidebar 是否围绕产品或包名组织。
- 是否需要中英文 locale。
- 是否需要把 `repo templates --markdown` 输出写进文档。

### 要创建 CLI

```bash
repo new toolbox --template cli
```

生成后先检查：

- `bin` 字段是否符合最终命令名。
- 参数解析、退出码和帮助信息是否可测试。
- 是否需要把命令用法写入 README。

## 创建前预览

```bash
repo new website --template vitepress --dry-run
repo new website --template vitepress --json
repo new website --template vitepress --json --out plans/website.json
```

`--dry-run` 不写入磁盘，只展示模板、源目录、目标目录、package name 和输出文件。

`--json` 输出同一份创建计划的结构化数据，隐含 `--dry-run`。

`--out <file>` 可以把文本或 JSON 预览写入文件，也隐含 `--dry-run`。

## 固化默认模板

```ts
import { defineMonorepoConfig } from 'repoctl'

export default defineMonorepoConfig({
  commands: {
    create: {
      defaultTemplate: 'tsdown',
    },
  },
})
```

之后：

```bash
repo new utils
```

会直接创建 `tsdown` 库包。

## 检查模板健康状态

```bash
repo templates --check
repo templates --check --json
```

模板检查会确认：

- 模板 source 和 target 没有重复。
- 每个模板 source 目录都存在。
- 每个模板根目录都有 `package.json`。
- 每个模板都有 category 和 description。
- 模板源目录里没有会被脚手架过滤掉的临时或生成文件。

## 继续阅读

- [接入已有 workspace](/zh/tasks/adopt-existing)
- [把校验加入 CI](/zh/tasks/ci)
- [配置文件](./config.md)
- [模板资产治理](/zh/reference/template-assets)

## 实例来源登记与历史关联

`repo new` 和 `create-repoctl` 成功后会把每个生成实例登记到 `.repoctl/template-instances.json`。请把该文件与 `.repoctl/template-baselines/` 一起纳入版本控制。记录包含稳定模板标识、实际模板包版本、源内容摘要、生成配置，以及白名单内的 `packageName` / `renameJson` 参数。自定义本地来源使用不可变内容摘要，不会声称拥有已发布的上游版本。根工程受管资产有独立所有权，不会登记为项目实例。

```sh
repo templates instances --json
repo templates instances packages/shared-utils --json
```

可用基线分为两层：原始分发模板，以及经过 repoctl 处理后的生成输出。快照按内容摘要保存文件字节、可执行标记与空目录，即使旧包不再可用，也能离线重建。生成缓存与依赖目录按模板复制规则排除。快照是数据，不会作为迁移脚本执行。Git 元数据仅随新生成文件的初始输出保存；历史关联不会根据当前机器推断旧项目的 Git 身份。

关联存量项目时必须显式指定历史模板包版本。`--source-dir` 指向已解压的 `@icebreakers/monorepo-templates` 包目录，需包含 `package.json` 和 `templates/`。命令核对包名与精确版本，不执行历史 JavaScript 或安装脚本，并拒绝不安全链接与路径逃逸。已安装包的版本相符时可直接使用；已经登记的可靠基线也支持离线重复关联。

```sh
repo templates link packages/shared-utils --template tsdown --source-version 2.1.0 --source-dir ../historical-templates --package-name shared-utils --json
# 核对新增、修改和删除的文件路径后：
repo templates link packages/shared-utils --template tsdown --source-version 2.1.0 --source-dir ../historical-templates --package-name shared-utils --apply --json
```

默认的 `repo-new-v1` 配置会改写包名、版本及相对根配置引用。历史输出为 `package.mock.json` 时加上 `--rename-json`。此前由 `create-repoctl` 直接复制的项目应选择 `--profile workspace-copy-v1`；它保留模板包名，不接受包信息改写参数。关联仅保存元数据与从模板重建的快照，不会把现有业务文件冒充历史基线，也不会改写业务文件。

无法恢复精确来源时，预览会报告 `unverified`，并说明不能可靠升级或比较上游版本。只有显式传入 `--unverified --apply` 才会登记这种关联。浮动标签（如 `latest`）、版本范围、冲突登记和过期 API 计划都会被拒绝。查询和预览不会创建登记文件；重复相同关联也不会产生无意义 diff。之后取得精确来源时，可以再次显式关联原未验证记录；预览会报告 `verify` 并先展示差异，再登记可靠基线。

```sh
repo templates rebuild-baseline packages/shared-utils --destination ../isolated-rendered-baseline
repo templates rebuild-baseline packages/shared-utils --destination ../isolated-original-template --original
```

重建目标目录必须尚不存在。快照丢失或损坏时报告 `unavailable`，不会显示为健康。实例目录被删除或改名后先报告 `missing`，新建命令会拒绝复用其已登记路径。`repo templates relocate <实例ID> <新相对路径>` 预览显式路径关联；只有旧路径已不存在、目标内容与留存的生成基线完全一致，`--apply` 才会更新登记路径。目标已发生业务修改时无法可靠证明它就是原实例，会明确拒绝自动关联。

登记采用锁与原子替换。登记失败不会宣称创建已完整成功，生成文件会保留在错误消息给出的具体恢复位置，供核对后显式关联。遇到残留锁时，先确认对应写入进程已停止，再移除提示路径下的锁。元数据提交失败会清理本次临时快照并保留原登记内容。

## 升级单个模板实例

使用已登记实例 ID 或目标路径选择实例，并指定目标模板包的精确版本。默认预览只读，只有 `--apply` 才会修改文件。`--source-dir` 将已解压包作为数据读取，不运行包内脚本；省略时，当前安装的模板包必须匹配请求版本。旧来源使用留存快照重建，因此无需继续安装旧包。

```sh
repo templates upgrade packages/shared-utils --source-version 2.2.0 --source-dir ../templates-2.2.0 --json
repo templates upgrade packages/shared-utils --source-version 2.2.0 --source-dir ../templates-2.2.0 --apply --json
```

计划比较旧生成基线、实例当前文件和新模板生成结果。仅模板改动会更新，仅业务改动会保留，互不重叠的文本改动会合并。首次生成时的包名与 Git 元数据会保留。成功后，基线前进到纯粹的新模板输出，业务定制不会混入上游基线。重复同一版本可离线使用留存快照，不会再次改写；同一版本下的来源内容发生变化会被拒绝。

重叠文本修改、二进制冲突、新增文件碰撞及文件/目录类型替换会阻断整个实例。预览给出冲突路径与文本片段，不向业务文件写入冲突标记。处理相关本地修改后重新预览，或显式将这些路径交由业务自行维护。文本合并保留 BOM、CRLF 与末尾换行；三份输入合计超过 1 MiB 的冲突文件需要手动处理。支持的平台会应用 POSIX 可执行标记；Windows 保留原生只读权限，不模拟可执行位。

```sh
repo templates upgrade packages/shared-utils --source-version 2.2.0 --source-dir ../templates-2.2.0 --exclude README.md src/custom --json
# 核对后应用相同选择：
repo templates upgrade packages/shared-utils --source-version 2.2.0 --source-dir ../templates-2.2.0 --exclude README.md src/custom --apply --json
```

排除路径相对于实例目录，应用后持久保存到实例记录。选择目录会排除全部后代；`src/custom/**` 等价于选择该目录。不支持任意 glob，也不接受路径逃逸。排除内容不会被读取或写入升级计划。业务自行添加的文件与目录不进入候选扫描，包括大文件及无关软链接。后续升级会累计已有排除项，目前没有自动恢复受管的命令。

用户删除的文件和目录保持删除，已删除目录下新增的上游后代也不会重新生成。上游删除文件时，仅本地未改动的文件会被移除；已经过业务修改则报告冲突。上游移除的目录会保守保留，避免删除其中的业务文件或缓存。历史基线缺失或未验证时停止升级。根受管资产、根依赖策略和其他已登记实例不属于本次操作；所选实例模板清单内的依赖修改作为普通文件差异处理。

### 恢复中断的升级

写入前，repoctl 会在 `.repoctl/template-upgrades/<实例ID>.json` 记录本次操作的文件状态与实例元数据。文件变更和元数据替换使用同一登记锁。普通失败会在释放锁前恢复本次操作；遇到并发业务编辑会保留新内容，未完成的恢复记录会阻止再次升级。

```sh
repo templates recover-upgrade packages/shared-utils --json
repo templates recover-upgrade packages/shared-utils --apply --json
```

恢复预览只读。应用恢复时，只有每个受影响路径仍与记录的变更前或变更后状态一致，才会恢复文件与旧来源版本；冲突的业务编辑须先另行保存并处理。恢复不会重放失败的升级。进程异常退出可能留下 `.repoctl/template-instances.lock`；核实记录中的进程已经停止后，再移除该锁并应用恢复。元数据已提交但恢复记录清理失败时，错误会明确说明升级已应用，此时恢复命令仍会撤销记录中的这次升级。

恢复记录仅包含本次实际修改文件的本地前后内容，操作成功或恢复完成后会自动删除。请作为本地备份处理，将 `.repoctl/template-upgrades/` 排除在版本控制之外，并继续跟踪实例登记与模板基线。JSON 预览也包含受管候选文件内容，应按对应文件的敏感程度保存。即使是预览模式，显式传入 `--out <文件>` 仍会写出报告。

## 诊断版本落后与受管文件漂移

```sh
repo templates drift --json
repo templates drift --source-dir ../templates-2.2.0 --markdown --out reports/template-drift.md
repo templates drift --remote --strict
repo doctor --rules template-instance-baseline,template-instance-version,template-instance-drift,root-asset-drift --strict
```

漂移诊断只读，不更新来源版本、快照、登记信息或业务文件。`--out` 仅写出指定报告。报告包含路径与内容摘要，不包含业务文件正文。

默认读取当前实际安装的模板包元数据，不访问网络。`--source-dir` 改为读取已解压包的元数据，不执行其脚本。`--remote` 显式查询公共 npm 仓库的 `latest` 标签并设置超时，不能与 `--source-dir` 同用。请求失败、返回内容无效或包身份不符时保持不可用状态。本地比较的 `same` 只表示两个已知版本一致，不代表已经是远程最新版本。`newer` 表示已知有较新模板包，不声称每个独立模板都发生变化。自定义快照来源没有可比较包版本，版本状态保留为 `unknown`。

每个实例或根资产分别报告基线有效性、版本比较（`newer`、`same`、`ahead`、`unknown`）与本地漂移。仅检查可信留存基线中的路径，业务新增文件不进入扫描；用户删除明确显示 `deleted`，持久升级排除项显示 `excluded` 且不读取内容。不安全或不可读路径显示 `unavailable`。根资产必须具有经过验证的 `.repoctl/baselines/root/` 记录才能参与比较；登记不存在表示未受管，不是已验证健康。

本地修改、删除、已知新版本和证据缺失默认产生警告。`--strict` 在存在有效警告时失败。Doctor 稳定规则 ID 为 `template-version-evidence`、`template-instance-registry`、`template-instance-baseline`、`template-instance-version`、`template-instance-drift`、`root-asset-registry`、`root-asset-version`、`root-asset-drift`。

需要保留有理由的诊断豁免时，复用 `commands.doctor.suppressions`。精确的 workspace 相对路径将决定限定到一处发现；省略路径会覆盖所有实例中对应规则。有效抑制影响有效统计与 strict 退出码，原始发现、理由、过期项和未命中项仍完整保留。诊断抑制不改变文件所有权；文件需要退出模板管理时，应使用实例升级的持久排除功能。

```ts
export default {
  commands: {
    doctor: {
      suppressions: [{
        id: 'template-instance-drift',
        path: 'packages/shared-utils/README.md',
        reason: '团队独立维护该业务文档',
        expires: '2027-01-31',
      }],
    },
  },
}
```

## React 组件库

```bash
pnpm create repoctl@latest my-workspace -- --yes --templates react-lib
# 或向已有工作区添加库：
repo new ui --template react-lib
```

`react-lib` 默认生成到 `packages/react-lib`，提供 React 19.3+ 的 ESM 组件库。
组件 `Counter` 和类型 `CounterProps` 从包根入口导入；消费应用还需显式导入
`包名/style.css`。React、React DOM 和 JSX runtime 保持 peer 外置，CSS 标记为副作用。
模板自带构建、ESLint/Stylelint、TypeScript、tsd 和基于构建产物的组件测试。

生成包默认保持私有。发布前请设置包名与版本，移除 `private` 或设为 `false`，
执行 `repo package check` 后再发布。源码工作区中的 `pnpm test:packaged-react-lib`
覆盖新建工作区和已有工作区两种创建方式，并把实际 tarball 安装到独立 Vite 应用中，
验证公开类型、生产样式、鼠标/键盘交互及共享同一 React 实例。打包入口保留
`use client`，并用 Next App Router 的服务端页面直接导入 tarball，验证生产构建、
浏览器水合和交互。Storybook 为可选扩展。

## 模板作者验证

`repo templates validate <key>` 是显式执行命令。它解析同一个内置/自定义模板目录，在作者仓库外生成临时工作区，通过 Corepack 使用声明的 pnpm 版本安装依赖，依次执行 build → lint → typecheck（TypeScript/Vue）→ tsd（类型库）→ test → test:e2e（已声明时）。缺少必需脚本会在安装前失败。存在样式文件时，`lint` 必须调用 Stylelint，或提供单独的 `lint:styles` 脚本。

```bash
repo templates validate internal --fixture ./fixtures/workspace --name basic --name renamed --json
repo templates validate react-lib --dry-run --json
repo templates validate internal --fixture ./fixtures/workspace --keep-failed --timeout 240000
```

可选 fixture 是作者维护的工作区骨架，包含 `package.json`、精确的 `packageManager: "pnpm@..."`、工作区设置及配套包。工具使用正常模板过滤复制它，不会修改原目录；未提供时使用已安装的 repoctl 工作区资产。每个名称生成独立工作区，目前名称组合验证重命名行为，尚不支持任意模板功能参数。

库模板仅在临时副本中移除 `private`，生成真实 tarball，检查 exports 与运行时依赖声明（含 `imports` 映射），再在独立消费者里安装并导入该包。声明文件通过严格 NodeNext 类型解析验证。应用、服务或浏览器行为由模板提供能正常结束的 `test`/`test:e2e` 脚本；脚本负责常规服务生命周期，工具提供超时和中断清理。浏览器安装由作者显式准备。

报告使用稳定阶段和诊断代码记录命令及输出。默认清理成功和失败样本；`--keep-failed` 保留失败样本及 `report.json`，`--keep-temp` 保留全部样本，并返回保留目录。普通 `repo templates` 和 `--check` 不执行模板命令。验证会执行受信任的作者脚本，不是运行不受信任代码的沙箱。

同一能力也通过公开 API 提供：

```ts
import { planTemplateValidation, validateTemplate } from 'repoctl'

const options = { cwd: process.cwd(), template: 'internal', fixtureDir: './fixtures/workspace' }
const controller = new AbortController()
const plan = await planTemplateValidation(options)
const report = await validateTemplate({ ...options, keep: 'failure', signal: controller.signal })
```

## 固定的 npm 与 Git 来源

自定义模板可以来自精确 npm 版本或显式 Git ref；`source` 表示归档内部的相对目录。模板就是归档根目录时使用 `source: '.'`。`templatesDir` 只影响本地来源。

```ts
export default defineMonorepoConfig({
  commands: {
    create: {
      cacheDir: './.cache/template-assets',
      templateMap: {
        team: {
          source: 'templates/library',
          target: 'packages/team',
          category: 'library',
          remote: { kind: 'npm', packageName: '@acme/templates', version: '1.2.3' },
        },
        service: {
          source: 'templates/service',
          target: 'apps/service',
          remote: { kind: 'git', repository: 'https://github.com/acme/templates.git', ref: 'v1.2.3' },
        },
      },
    },
  },
})
```

```sh
repo templates fetch team --json
repo new sdk --template team --dry-run
repo new sdk --template team --offline
repo templates validate team --fixture ./fixtures/workspace --offline --json
```

`repo templates fetch <key>` 只获取并验证资产。实际创建和作者验证也能获取缺失来源。列表、健康检查、创建预览、验证预览保持只读，需要先 fetch 同一个来源。`--offline` 遇到缓存缺失直接失败。fetch/new/package-create/validate 的 `--cache-dir` 与 `commands.create.cacheDir` 相对调用目录解析；默认目录为 `$XDG_CACHE_HOME/repoctl/template-sources-v1`，未设置时为 `~/.cache/repoctl/template-sources-v1`。

npm 只接受精确版本，不接受标签或范围。registry 优先使用 `remote.registry`，其次使用 npm 的 scope 配置或默认 registry。已有 `.npmrc` 认证信息仅保留在内存中，不写入计划、缓存清单和来源记录。Git 支持 HTTPS、SSH、file URL，必须提供 ref。通过 credential helper 或 SSH agent 认证，不在 URL 中嵌入凭据。下载阶段不会运行远程包脚本、Git hooks、子模块或依赖安装。

首次获取 Git ref 会记录解析后的 commit。即使分支或标签移动，同一个请求仍复用已验证的缓存 commit。跨全新缓存复现时应填写完整 commit hash；明确需要重新解析浮动 ref 时，可以使用新缓存目录，或确认没有写入者后删除对应缓存项。缓存损坏会明确失败，不会静默信任或刷新。归档在解包前检查体积与路径，拒绝越界、链接、特殊文件以及大小写或 Unicode 等可移植路径冲突。

创建记录 npm 版本与 integrity，或 Git commit 与 integrity，并保存可重建基线。远程实例支持基线重建与漂移检查。`templates upgrade` 当前接受内置模板包版本，对远程实例明确报错；修改远程声明不会升级已生成项目。

公共函数 `resolveRemoteTemplateSource(remote, source, { cwd, cacheDir, offline })` 返回已验证的 `sourceDir`、规范化 `request`、固定的 `resolved` 身份、资产 `digest` 和 `cache: 'hit' | 'downloaded'`。
