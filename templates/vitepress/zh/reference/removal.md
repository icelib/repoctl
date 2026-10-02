# 安全移除工作区包

`workspace remove` 按准确包名或显式工作区相对目录预览移除单个包。计划包含根包和私有包消费者、传递依赖路径、目录内容（含忽略文件）、准确清单变更，以及待人工复核的源码/配置引用。

```bash
repo workspace remove @acme/legacy
repo workspace remove ./packages/legacy --dry-run --json > ../remove-plan.json
# 显式将消费者清单中的依赖字段纳入移除计划：
repo workspace remove @acme/legacy --remove-references --json > ../remove-plan.json
repo workspace remove --apply ../remove-plan.json --json
```

预览始终只读，`--dry-run` 用于明确默认行为。请将计划保存在所选包之外。存在阻塞项时仍输出 JSON，但退出码为 1。写入必须另行使用 `--apply`，不能同时传入目标、`--remove-references` 或 `--dry-run`。

## 选择边界和阻塞项

首版要求 Git 仓库已有提交，所选目录没有暂存、未暂存或未跟踪变更。忽略文件会进入待审查的目录清单。根包、工作区外路径、目标祖先中的符号链接、内嵌 Git 仓库，以及包含未选择嵌套工作区的目录均不可移除。重名包必须用显式 `./目录` 消除歧义。这些边界没有 force 绕过选项。

默认情况下，存在消费者就阻止移除。`--remove-references` 仅计划删除预览中列出的准确依赖字段，以及对应 `peerDependenciesMeta` 和不再使用的 `dependenciesMeta` 项；保留无关字段和依赖声明。可能指向目标的不确定图关系（包括未解析 catalog 别名）会阻塞应用。首版只支持每个工作区包使用单一 JSON 清单。

人工复核扫描仅检查所选包外 Git 跟踪的文本，以包名/目录字面量匹配，不解析 import 或动态配置。未跟踪/忽略文件、二进制、符号链接、硬链接、超过 1 MiB 的文件、不支持的文本扩展名和锁文件均被排除。`review.scanned`、`review.matches`、`review.skipped` 描述这一有限证据；命中项需要人工检查，不会自动替换。请另行检查源码 import、scripts、Turbo 配置、workspace glob、bundled dependency 列表、文档和发布配置。

## 应用和恢复

应用前重新生成计划，拒绝清单、工作区集合、Git HEAD、已扫描文本、目录条目、内容、修改时间或链接目标发生漂移的计划。JSON 包含绝对路径和清单内容，分享前请先在本地检查。

事务先暂存清单替换文件，再将所选目录移动到 `node_modules/.cache/repoctl/removals/` 下本次操作专用目录。恢复目录的祖先必须是真实目录；跨设备移动失败会安全退出，不采用复制后删除的降级。提交前发生错误，会在安全前提下恢复已修改清单和原目录。并发编辑与新建的目标目录会被保留；错误中列出保留的原文件路径，供人工恢复。提交后仅清理失败时，返回 `status: "applied"` 和 `cleanupPending` 路径，不会谎报已回滚。核对这些准确路径后再清理，不要直接清空共享缓存。

命令不会修改锁文件。请使用仓库声明的 pnpm 版本显式完成后续步骤：

```bash
pnpm install --lockfile-only
pnpm install --frozen-lockfile
repo check --full
git diff
```

程序调用可使用 `planWorkspaceRemoval(cwd, { target, removeReferences })` 和 `applyWorkspaceRemovalPlan(cwd, plan)`。JSON 计划的 schema 版本为 1。重复应用已完成的计划，仅在剩余工作区仍符合预期时返回 `unchanged`。
