# Lefthook

Lefthook 通过仓库根目录的 `lefthook.yml` 管理 Git 钩子和暂存文件任务。repoctl 默认采用 Lefthook 2.2.2，使用其内置的部分暂存文件保护。

## 安装钩子

克隆仓库后运行 `pnpm install`。`pnpm-workspace.yaml` 中的 `allowBuilds.lefthook: true` 允许 Lefthook postinstall 安装钩子，不再需要 Husky 的 `prepare` 脚本。CI 会跳过自动安装，发布流程使用 `LEFTHOOK=0` 跳过钩子执行。

修改 Git 配置或恢复依赖缓存后，可以显式安装并检查：

```bash
pnpm exec lefthook install
pnpm exec repo doctor
```

`repo init --tooling lefthook` 会生成原生配置、添加依赖和构建许可。standard 初始化预设还会生成钩子需要的 ESLint、Stylelint、commitlint 和 TypeScript 配置。

已有 workspace 如果使用 `onlyBuiltDependencies`，会保留该权限格式以兼容旧版 pnpm，并将 Lefthook 加入允许列表。显式禁止 postinstall 的设置会保留，此时需要手动安装钩子。

## 默认校验

| 钩子       | 按顺序执行的任务                                                                          |
| ---------- | ----------------------------------------------------------------------------------------- |
| pre-commit | ESLint 修复暂存代码与文档，Stylelint 修复暂存样式和 Vue SFC，repoctl 检查涉及的 workspace |
| commit-msg | `pnpm exec repo verify commit-msg "{1}"`                                                  |
| pre-push   | `pnpm lint`，然后 `pnpm typecheck`                                                        |

pre-commit 串行执行，遇到失败立即停止。ESLint 和 Stylelint 都会修改 Vue 文件，因此不能并发运行。两项任务均启用 `stage_fixed: true`，自动暂存修复结果。`glob_matcher: doublestar` 让匹配规则同时覆盖根目录和嵌套文件。

修复命令通过 `git diff -z` 和 `xargs -0` 读取暂存路径，避免 Windows 上的空格、中文和单引号被错误转义。定制文件范围时，需要同步修改命令中的 Git pathspec 与对应的 `glob`、`exclude`。Git for Windows 提供所需的 shell 和 `xargs`。

最后一个任务只调用一次不带文件参数的 `repo verify staged-typecheck`。repoctl 用 Git 的 NUL 分隔输出读取暂存文件，排除删除项，再按文件所属 workspace 去重执行 `typecheck`。涉及根目录时只运行根级检查，避免重复检查子包。Vue workspace 通过脚本运行 `vue-tsc`，其他 TypeScript workspace 运行 `tsc`。

也可以传入明确的文件列表：

```bash
pnpm exec repo verify staged-typecheck packages/ui/src/button.ts
pnpm exec repo verify pre-commit
```

`pre-commit` 包装命令会调用 Lefthook。不要在 `lefthook.yml` 内再次调用 `repo verify pre-commit`，否则会递归执行。`repo verify pre-push` 仍可独立使用，它会根据推送范围额外选择 build、test、tsd 任务。

## 部分暂存和失败行为

Lefthook 会在 pre-commit 执行期间隐藏部分暂存文件中未暂存的修改，结束后恢复。成功的修复会自动暂存。任务失败会阻止提交，但可能保留已完成的修复，这与 lint-staged 默认回滚修复的行为不同。重试前检查 `git diff` 和 `git diff --cached`。恢复未暂存修改发生冲突时也会阻止提交，处理冲突时应保留原始修改。

## 迁移已有项目

运行 `repo upgrade --yes`，将识别到的默认 Husky/lint-staged 配置整体迁移，然后运行 `pnpm install` 和 `pnpm exec lefthook install`。`--no-overwrite` 和 `skipOverwrite` 会保留整套旧配置。自定义钩子、暂存文件配置和安装脚本会保留，并提示手动迁移；对应的 package.json 和 workspace 清单也会保留，让旧钩子继续使用支持旧 API 的 CLI，直到手动迁移完成。

自定义项目应先将命令转换为 Lefthook 原生任务，验证后再删除 Husky、lint-staged 依赖及其配置，并移除默认的 `prepare: husky` 脚本。如果**本地** `core.hooksPath` 仍指向 `.husky` 或 `.husky/_`，先清除该本地配置再安装 Lefthook。repoctl 不会修改全局 Git 设置或无关的自定义钩子路径。

旧字段 `tooling.husky`、`tooling.lintStaged`，类型 `HuskyToolingConfig`、`LintStagedToolingConfig`、`MonorepoLintStagedConfig`、`MonorepoLintStagedConfigOptions`，以及 `createMonorepoLintStagedConfig()`、`defineLintStagedConfig()` 已移除。命令、文件匹配和排除规则直接写在 `lefthook.yml` 中。自动化中的 `HUSKY=0` 应替换为 `LEFTHOOK=0`。
