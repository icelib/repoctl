# 移动或重命名工作区

`repo workspace move` 分别支持目录移动、npm 包名修改，以及两者同时变更。用准确包名或 `./目录` 选择一个包，`--to` 指定相对工作区根的目标目录，`--name` 指定新 npm 包名。

```bash
repo workspace move @acme/ui --to libs/ui --json > ../move-plan.json
repo workspace move @acme/ui --name @acme/design --json > ../rename-plan.json
repo workspace move ./packages/ui --to libs/design --name @acme/design --json > ../move-plan.json
repo workspace move --apply ../move-plan.json --json
```

默认只预览。将 JSON 保存到所选目录之外，审查新旧位置与包名、直接及传递消费者、文件内容、变更字段、阻塞项和人工任务，再显式应用。目标包与待更新文件必须处于干净的 Git 状态，没有强制绕过模式。`--apply` 不能与选择或预览选项混用。

计划会更新四种依赖段的包名键、对应元数据、`workspace:` / `npm:` 别名，以及相对 `workspace:` / `link:` / `file:` 引用。别名键保留，除非它本身就是旧包名。普通 semver 引用沿用共享依赖图的本地候选语义；无法解析或非本地声明只列为人工候选，不猜测目标。与旧目录一致的 `repository.directory` 会同步。保留已有 workspace glob，移动准确路径项，必要时添加目标目录；被排除规则匹配的目标会被拒绝。

对 Git 跟踪的 `tsconfig.json` 和 `tsconfig.*.json`，支持保留 JSONC 注释，更新相对 `extends`、项目 references、`files` / `include` / `exclude`、路径别名，以及显式的 `baseUrl`、`rootDir` / `rootDirs`、`outDir`、`declarationDir`、`typeRoots`。可能改变覆盖范围的较宽 include/exclude glob 保留原样并提示人工复核，不分析通配符展开结果。不执行配置继承解析；`paths` 可能依赖继承的 `baseUrl` 时保持原样并列出人工任务。绝对路径、可执行配置和其他配置格式需要人工复核。

源码保持原样。人工任务提供文件与行号，指出旧名称、旧路径和可能改变含义的相对字符串路径。这是有范围的 Git 跟踪文本扫描，并非完整 import 解析：忽略/未跟踪文件、二进制、超过 1 MiB 的文件、生成代码、插值字符串和动态引用不在覆盖范围内。符号链接文本保留并提示复核。构建前必须处理这些任务；直接依赖改名后，开发者仍需更新源码中的 import。

根目录、越界路径、已存在目标、重复或无效包名、目标祖先中的链接、工作区重叠、内嵌 Git、脏输入和过期计划都会被拒绝。目标目录中的所有文件（包括忽略文件）均纳入清单，提交变更前校验哈希、文件身份、工作区成员和 Git HEAD。失败时协调恢复清单与目录；并发编辑和新建替代目录会保留，并报告恢复路径。若变更已提交但清理失败，返回 `status: applied` 与 `cleanupPending`，检查后再清理。成功且未继续修改的计划可以重复应用，不再次写入。

应用过程从首次重新校验或重复应用检查，到清理或回滚结束，持续持有 `.repoctl/workspace-move.lock`。并发应用会被拒绝。进程异常退出后，先确认没有活动写入者并恢复待处理备份，再人工移除遗留锁。

命令不改写锁文件、不执行安装脚本。处理完人工任务后，显式运行：

```bash
pnpm install --lockfile-only
pnpm install --frozen-lockfile
repo check
git diff
```

已发布包改名意味着新的 npm 包身份。此命令不发布、不废弃旧包，也不执行 Git 提交或推送。

构建产物 API 导出 `planWorkspaceMove(cwd, options)`、`applyWorkspaceMovePlan(cwd, plan)`、`WorkspaceMoveOptions`、`WorkspaceMovePlan` 和 `WorkspaceMoveResult`。
