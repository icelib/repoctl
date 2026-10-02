# 模板与创建

repoctl 的模板由 `@icebreakers/monorepo-templates` 维护。CLI、脚手架和文档都复用同一份模板元数据。

更偏维护者视角的模板元数据、健康检查和自定义模板说明见：[模板资产治理](/zh/reference/template-assets)。

## 内置模板

| Key           | Category | 默认目录           | 适合场景                           |
| ------------- | -------- | ------------------ | ---------------------------------- |
| `tsdown`      | library  | `packages/tsdown`  | TypeScript 库包                    |
| `vue-lib`     | library  | `packages/vue-lib` | Vue 3 组件库                       |
| `vue-hono`    | app      | `apps/client`      | Vue 3 + Hono 前后端一体应用        |
| `react-vite`  | app      | `apps/react-vite`  | React + Vite + TypeScript 单页应用 |
| `hono-server` | service  | `apps/server`      | Hono API 服务                      |
| `vitepress`   | docs     | `apps/website`     | VitePress 文档站                   |
| `nimbus`      | docs     | `apps/docs`        | Nimbus + Astro，默认中英双语文档   |
| `cli`         | tool     | `apps/cli`         | TypeScript 命令行工具              |

Nimbus 是新建文档站点（`Docs Site`）的默认模板，提供英文 `/`、中文 `/zh/`、搜索和 AI 文档入口。VitePress 仍可显式选择，两者分别生成到 `apps/docs` 和 `apps/website`，可以同时使用。通用创建命令仍默认使用 `tsdown`；项目名称 `docs` 不会隐式改变模板。非交互调用请显式指定 `--template nimbus`。

## 查看模板

```bash
repo templates
repo templates tsdown
repo templates --category library
repo templates --json
repo templates --markdown --out docs/templates.md
```

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
