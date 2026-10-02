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
