# repoctl 持续改进记录

以生成项目、创建包、校验与升级这几条真实交付路径为起点。每轮先记录问题依据与验收条件，再实施、验证并更新状态；新功能按实际收益、兼容性和维护成本排序。本记录属于源码仓库文档。

## 首批交付

当前五项均已实施并完成统一验证；后续候选仍需新的复现证据后再进入下一轮。

| 优先级 | 工作项及问题依据 | 验收条件 | 状态 |
| --- | --- | --- | --- |
| P1 | 生成项目脚本引用源码仓库专用 helper，创建入口与资产分发各自处理脚本 | 共用消费者 manifest 处理；安装实际 tarball 后生成项目的 lint/typecheck/test 可执行，脚本无悬空引用 | 已验证 |
| P1 | pre-push 写死本仓库包目录，按行解析 Git 且漏删文件；任务顺序与根/包任务重复 | 按实际 pnpm workspace 发现私有包，最长路径匹配；删除、跨包重命名、特殊字符、新远程与 force-push 回退均进入任务；全局阶段顺序正确 | 已验证 |
| P1 | 创建与 doctor 把固定目录字符串当作 workspace 规则 | 深层目录、精确路径、组合规则与排除规则遵循 pnpm 语义；已有规则覆盖不改 manifest；显式排除在写入前拒绝 | 已验证 |
| P1 | 创建过程直接写目标目录，失败可能留下部分工程或 manifest 修改 | 计划与执行共用模板校验；临时目录准备，提交失败回滚本次文件和 manifest；保留用户原有文件，失败后能重试 | 已验证 |
| P1 | 升级缺少只读计划，旧发布状态删除与覆盖选择缺少关联 | CLI/API 输出一致计划；JSON 隐含预览；整目录无变化；拒绝或失败保留旧状态；自定义 workflow 默认保留；成功迁移后才删除旧状态 | 已验证 |

## 验证记录

- 按 build → lint → typecheck → tsd → test 执行并通过：19/19 build，17/17 lint，19/19 typecheck，6/6 tsd，128 个测试文件 / 836 个测试，开发场景 2 个文件 / 4 个测试。
- 常规测试保留内部单元覆盖，消费者路径使用构建后的公开入口；真实临时 Git 工程覆盖 pre-push，避免只用模拟输出。
- 打包验证覆盖两个 CLI bin、创建入口、公开导出、生成工程脚本、packaged-create、packaged-doctor（10 pass / 0 warn / 0 fail）、Worker 模板、workflow 合同和无追踪构建产物检查。
- 保留三平台 × Node 22/24 CI，packaged-doctor 接入 Ubuntu Node 22；换行文件名仅在允许该文件名的平台验证，空格和中文路径覆盖全部平台。
- 完成交付前补齐可发布包的 pnpm change intent，复查超过 300 行的被修改模块，并把本节更新为实际命令与结果。

## 第二轮交付

首批完成后，针对两个可复现的交付缺陷继续加固：

| 优先级 | 工作项及问题依据 | 验收条件 | 状态 |
| --- | --- | --- | --- |
| P1 | 根工程没有递归 build 脚本时，pre-push 直接逐包执行，绕过 `^build`；依赖包可能在消费者之后构建，或未变更上游缺少 dist | 读取 workspace 依赖关系；build 纳入变更包的上游闭包并按依赖优先排序，保留阶段顺序、显式 workspace 参数和任务去重；A→B、A-only 且 B/dist 缺失场景通过真实 Git fixture | 已验证 |
| P1 | `repo doctor` 解析损坏的 `pnpm-workspace.yaml` 时直接抛异常，JSON/Markdown 输出和退出码不稳定 | 捕获 YAML 解析错误；输出合法报告并生成稳定 `workspace-manifest` fail 检查，保留其它诊断，`--json` 可被机器解析且失败返回退出码 1 | 已验证 |

第二轮验证：依赖拓扑与 pre-push 回归 21 项通过；doctor 回归 10 项通过；受影响源码 ESLint、monorepo typecheck、monorepo tsd 和 diff 检查通过。

## 第三轮交付

第二轮完成后，按长进程 API、升级预览和失败恢复路径复现出三个边界问题，并完成收口：

| 优先级 | 工作项及问题依据 | 验收条件 | 状态 |
| --- | --- | --- | --- |
| P1 | workspace 发现结果在同一进程内缓存；clean 删除包或 init 创建 manifest 后，后续 API 仍返回旧包列表 | clean/init 成功或失败后清除发现缓存；真实临时 workspace 覆盖删除后重新发现和初始化后重新发现 | 已验证 |
| P1 | 创建发布阶段直接把模板复制到目标；`copyFile` 中断可能留下未记录的半文件，独占目标遇到并发文件时回滚可能误删用户内容 | 先复制到目标目录临时文件，再以独占安装提交；复制失败无残留，并发文件保留；创建单测覆盖真实文件系统 | 已验证 |
| P1 | 升级回滚会无条件写回已完成操作的旧内容，可能覆盖后续并发用户编辑；普通 dry-run 省略迁移依赖 | 回滚仅在目标仍等于本次结果时恢复；迁移依赖在文本与 JSON 预览均可见；并发编辑、部分写入和 CLI 预览回归通过 | 已验证 |

第三轮验证：workspace/create/upgrade 相关回归通过；完整测试 125 个文件 / 816 个测试；打包 create 与 doctor 串行通过；Worker 类型、workflow 合同、无追踪构建产物、change intent 和 `git diff --check` 通过。

## 第四轮交付

第三轮验证后，继续审查真实诊断、升级写入和创建提交阶段，复现并修复三个边界问题：

| 优先级 | 工作项及问题依据 | 验收条件 | 状态 |
| --- | --- | --- | --- |
| P1 | doctor 只扫描 `apps`、`packages`、`examples`，漏掉 `modules/platform/client` 等非约定目录中的未覆盖包 | 使用 pnpm 的完整发现规则再按排除规则过滤；非约定目录包进入诊断，既有 JSON/Markdown 字段保持稳定 | 已验证 |
| P1 | upgrade 写入直接覆盖目标，部分写入或并发编辑可能留下截断文件，回滚可能覆盖用户后续修改；删除遇到 ENOENT 竞态可能误恢复文件 | 同目录临时文件 + 原子 rename；每步执行前复核 `before`；回滚仅在目标仍匹配本次结果时执行，未知状态和失败删除的缺失目标均保留用户内容 | 已验证 |
| P1 | create 提交 workspace manifest 时，`link`/`rename` 可能已经完成后才报告失败，旧恢复逻辑会残留 manifest 修改或误删用户编辑 | 记录提交前状态与预期内容；仅在 inode/内容仍属于本次提交时恢复；符号链接和并发用户编辑保留；真实临时目录故障注入可重试 | 已验证 |
| P2 | tooling 项目发现逻辑加入了精确 workspace 路径后，超长 `tooling/index.ts` 继续承载多个职责 | 将 workspace 发现、公共类型、lint 配置和 Vitest 配置拆入 `src/tooling/`，保留 `repoctl/tooling` 的公开导出与类型行为 | 已验证 |

第四轮验证：19/19 build、17/17 lint、19/19 typecheck、6/6 tsd、125 个测试文件 / 816 个测试均通过；packaged-create、packaged-doctor（10 pass / 0 warn / 0 fail）、Worker 类型、workflow 合同、无追踪构建产物、change intent 和 `git diff --check` 均通过。

## 第五轮交付

第四轮之后，使用已构建 CLI 对升级预览和长进程 workspace 调用做了针对性复现：`package.json`、`pnpm-workspace.yaml` 和 `AGENTS.md` 实际会发生大范围合并，但原预览只能显示 `changed`；程序化调用返回的 pnpm manifest 也会污染同进程缓存，升级失败后还可能继续读取旧对象。两项均已收口：

| 优先级 | 工作项及问题依据 | 验收条件 | 状态 |
| --- | --- | --- | --- |
| P1 | `upgrade --dry-run` 只能显示路径和 `changed`，无法判断 package、workspace 和规范文件会覆盖什么内容 | 计划/API 提供文本/二进制摘要；`--diff` 或 `diff: true` 才输出不超过 16 KiB 的 unified 文本；JSON 可解析且预览不改目标树 | 已验证 |
| P1 | workspace 缓存直接返回 pnpm manifest 对象，调用方编辑返回值或升级失败后会读到旧内容 | 返回 manifest 与缓存隔离；upgrade 无论成功或失败都清理缓存；同进程 mutation 和失败重读回归通过 | 已验证 |

第五轮定向验证：升级计划、差异边界、workspace 隔离与 upgrade 失败缓存回归共 27 项通过；受影响 ESLint、monorepo typecheck 和 `git diff --check` 通过。

第五轮完整门禁：19/19 build、17/17 lint、19/19 typecheck、6/6 tsd、127 个测试文件 / 824 个测试和 2 个开发场景 / 4 个测试通过；packaged-create、packaged-doctor（10 pass / 0 warn / 0 fail）、Worker 类型、workflow 合同、无追踪构建产物、`pnpm change check` 和 `git diff --check` 均通过。packaged-create 与 packaged-doctor 按顺序执行，避免两个 prepack 同时同步模板资产造成临时目录竞争。

## 第六轮交付

复查长进程 API 时发现 workspace 发现 Promise 的拒绝结果也会被缓存：损坏的 `pnpm-workspace.yaml` 修复后，同一进程仍重复抛出旧错误；包扫描临时失败也有同样问题。缓存现在只保留成功结果，拒绝时按 Promise 身份移除，避免并发中的新扫描被旧错误清掉。

| 优先级 | 工作项及问题依据 | 验收条件 | 状态 |
| --- | --- | --- | --- |
| P1 | workspace 目录、manifest、包扫描的 rejected Promise 永久污染进程缓存，修复磁盘后必须手动调用清理 API | 三类发现失败均可自动重试；旧 rejection 不会删除并发中的新缓存；原有成功缓存与深拷贝语义保持 | 已验证 |

第六轮定向验证：workspace 缓存 9 项通过，受影响 ESLint 与 `git diff --check` 通过。完整门禁已在第五轮结果基础上仅需复跑受影响包即可；下一轮中断恢复仍先做 journal 设计和 SIGKILL 复现，再决定实现范围。

## 第七轮交付

中断恢复审查确认无持久事务状态时不能安全猜测目标目录或 manifest 的归属。先交付一个安全边界：创建 staging 写入包含 PID、cwd、target 和时间的 ownership marker；后续重试只清理由 marker 明确归属、进程已退出且超过 24 小时保护期的 staging，未标记、路径不匹配、进程仍存活或较新的目录全部保留供人工检查。该切片不触碰 partial target 或 manifest。

| 优先级 | 工作项及问题依据 | 验收条件 | 状态 |
| --- | --- | --- | --- |
| P1 | SIGKILL 会留下 `.repoctl-create-*` staging，旧重试既无法判断归属也会因目标存在而失败；按前缀盲删可能误删用户目录 | 合法 marker 才能触发清理；PID/路径/年龄校验通过后只删除 staging；未标记和不满足条件的目录保留；创建重试和 300 行模块约束回归通过 | 已验证 |

第七轮定向验证：create 相关 23 项（与 workspace 缓存合计 32 项）通过，受影响 ESLint、monorepo typecheck 和 `git diff --check` 通过。完整 durable journal、partial target 判定、upgrade temp ownership 和显式 `repo recover` 仍作为后续 P1 设计，不自动扩展清理范围。

## 后续候选（持续更新）

已交付项目保留轮次索引；待审查项目须有复现或性能证据后才能进入实施，当前 goal 保持 active。

| 优先级 | 项目 | 状态、证据及验收条件 |
| --- | --- | --- |
| P1 | 中断创建的显式恢复与升级状态诊断 | 已交付：第八、十、十二、十四、十五轮；API、CLI、journal 与 doctor 均有回归 |
| P1 | 创建恢复中保留用户编辑并清理匹配生成文件 | 已交付：第二十五轮；混合目标回归通过 |
| P1 | 升级迁移遵守文件选择 | 已交付：第二十六轮；构建产物回归覆盖排除目标、只读依赖与预览不写入 |
| P1 | 后续创建不得清理仍被中断目标需要的 staging | 已交付：第二十七轮；构建产物回归覆盖目标存在、损坏标记、悬空软链和无目标残留 |
| P1 | 中断发生在 manifest 提交后的创建恢复 | 已交付：第二十八轮；持久记录、用户修改保护、恢复再次中断和预览回归均通过完整门禁 |
| P2 | 直接 workspace API 的路径别名导致根包过滤失效 | 已交付：第二十九轮；物理根身份、fallback 相对路径、alias 重定向和无效目录兼容均有构建产物回归并通过完整门禁 |
| P1 | 命令消费者仍混用 cwd 别名和物理包路径 | 已交付：第三十轮；显式 pre-push 路径、create/init metadata 与 README 物理路径身份回归通过完整门禁 |
| P2 | init README 特殊字符路径链接损坏 | 已交付：第三十一轮；13 项构建产物回归覆盖 Markdown 解析后的真实 URL 指向、父级/嵌套路径及 metadata 不编码；已通过完整门禁 |
| P2 | init README 合法包名被 Markdown 强调语法改变 | 已交付：第三十二轮；11 项 built 回归覆盖标签原文、href、manifest 和 description 兼容，通过联合完整门禁 |
| P1 | init 缩小隐式 workspace 并静默改写损坏 manifest | 已交付：第三十三轮；写入前严格校验、隐式规则、空文档与 null、YAML 注释和 packages alias 回归通过完整门禁 |
| P1 | workspace YAML 版本指令改变发现与写入语义 | 已交付：第三十四轮；统一当前 pnpm core 语义，16 项 built 回归覆盖版本指令、合法/非法标签和写回语义，预览与失败无写入，通过完整门禁 |
| P1 | catalog/catalogs 结构校验晚于初始化写入 | 已交付：第三十五轮；共享 pnpm 清单结构校验，22 项 built 回归覆盖非法 catalog 拒绝、全树无写入、合法值保留、空 package rule、错误优先级和修复重试，通过完整门禁 |
| P1 | 升级清单解析仍偏离 pnpm schema | 已交付：第三十六轮；统一语义解析与序列化、保留隐式规则、迁移前完整校验，20 项新增回归及完整门禁通过 |
| P1 | create 保留空白或仅注释清单，报告成功但 pnpm 仍无法读取 | 已交付：第三十七轮；空白清单初始化为准确路径，预览无写入，null/{} 保留隐式发现，失败回滚与中断恢复可重试；完整门禁通过 |
| P1 | init/create 追加 packages 时的锚点与别名键边界 | 已交付：第三十七轮；按语义键定位并隔离共享引用，保留其他字段值及注释，所有清单改写在写前重读比较；完整门禁通过 |
| P2 | pre-push 对非当前分支的推送检查了当前工作树 | 第三十八轮实施中：同一 broken ref 在 main 检出时退出 0、在 broken 检出时退出 9，多 ref 同样误放行；按目标提交准备独立快照和依赖，执行真实提交的验证，保留原工作树 |
| P2 | 程序化 workspace 缓存的细粒度失效 | 待性能证据：观察高频长进程调用开销，再决定是否从全局失效细化为按根目录失效 |

## 第八轮交付

第七轮的 ownership marker 只能安全清理 create staging，无法判断 upgrade 在多文件写入中途被终止后的目标状态。为避免下一次升级覆盖未知状态，本轮为 upgrade 增加持久事务 journal：写入前记录每个文件的 before/after 摘要、inode/dev、权限和删除/修改文件的 pre-image；每一步完成后原子更新应用状态。未完成或损坏的 journal 会生成稳定的 `needs-review` 检查并阻止新的升级写入，保留用户文件等待人工处理；预览读取 journal 时不删除目标工程中的元数据。

| 优先级 | 工作项及问题依据 | 验收条件 | 状态 |
| --- | --- | --- | --- |
| P1 | upgrade 在写入成功但进程被终止、或 journal 更新失败时无法判断哪些文件已提交，下一次运行可能覆盖用户编辑 | `.repoctl/transactions` 使用版本化 journal；原子写入、哈希/字节数/inode/dev/权限和 pre-image 可读；失败回滚仅在结果仍匹配时执行；未完成事务阻止下一次升级并提供可读 inspection API | 已验证 |

第八轮定向验证：journal 与 upgrade transaction 共 14 项通过；monorepo typecheck、build、tsd 和受影响 ESLint 通过。完整门禁已重跑：19/19 build、17/17 lint、19/19 typecheck、6/6 tsd、128 个测试文件 / 836 个测试和 2 个开发场景 / 4 个测试通过；packaged-create、packaged-doctor（10 pass / 0 warn / 0 fail）、Worker 类型、workflow 合同、无追踪构建产物、`pnpm change check` 和 `git diff --check` 均通过。新增校验覆盖损坏/错位 journal、事务存储文件、部分创建写入和父目录符号链接；当前不自动恢复 ambiguous 状态，也不删除未归属的 staging 或目标文件。

## 第九轮验证修复

全量测试复现出开发 watch 场景的偶发竞态：目标产物已经写入，但 Turbo 转发的子进程 stdout 仍未按构建完成顺序送达，测试因此误报依赖顺序错误。构建 fixture 现在写入临时 workspace 根目录的 `build-events.log`，测试据此断言真实 `START`/`DONE` 事件顺序；该文件加入临时工程的忽略规则，不进入生成结果。开发场景连续复跑通过，随后全量测试恢复稳定。

第九轮验证结果：`pnpm test` 为 128 个测试文件 / 836 个测试通过；build、lint、monorepo typecheck、tsd、packaged-create、packaged-doctor（10 pass / 0 warn / 0 fail）、Worker 类型、workflow 合同、无追踪构建产物、`pnpm change check` 和 `git diff --check` 全部通过。工作树仍保留为未提交的可审查改动。

## 第十轮交付

继续复查中断与并发边界后，补齐三项可独立验证的安全约束：升级事务使用 `.repoctl/upgrade.lock/owner.json` 进行原子跨进程互斥，正常完成、回滚、需要人工复核和初始化失败都会释放锁；已退出进程留下的锁通过原子改名回收，损坏、缺失元数据或符号链接锁保留并报告稳定错误码。创建提交阶段写入临时 target ownership marker，成功后删除；公开 `inspectCreateTarget()` 只读判断 `missing`、`active`、`stale` 和 `malformed`，不会自动清理目标内容。发布 workflow marker 只有独立 YAML 注释行才算受管，legacy workflow 识别结构化 `uses`、`- run:`、`publish/version` 输入和发布脚本，避免自定义脚本中的相同文本误触发迁移或覆盖。

验收条件：并发 upgrade、死亡 PID、损坏锁、SIGKILL 后 partial target、无效 ownership marker、自定义 workflow marker 文本和正常迁移均有真实文件系统回归；新增 API 具备 monorepo/repoctl 类型断言；所有未知状态继续保留供人工处理。

第十轮最终验证：Vitest 129 个文件 / 845 个测试通过，开发场景 2 个文件 / 4 个测试通过；build 19/19、lint 17/17、monorepo typecheck、tsd 6/6、packaged-create、packaged-doctor（10 pass / 0 warn / 0 fail）、Worker 类型、workflow 合同、无追踪构建产物、`pnpm change check` 和 `git diff --check` 均通过。创建测试按 300 行约束拆入 `test/commands/create/`；原始 checkout 的 `templates/nimbus/` 未改动。

## 第十一轮：升级锁初始化失败恢复

故障注入复现出锁目录创建成功后 `owner.json` 写入失败的清理边界：旧实现按路径递归删除，若写入错误前路径被替换为符号链接或另一份损坏锁，会误删并破坏待人工诊断的状态。该场景也会让一次写入失败留下不可区分的空锁目录，阻塞后续升级。

| 优先级 | 工作项及问题依据 | 验收条件 | 状态 |
| --- | --- | --- | --- |
| P1 | upgrade lock 初始化在 owner 元数据写入失败时用递归路径删除，可能误删替换后的符号链接/损坏锁；空目录清理失败会永久阻塞后续调用 | 记录刚创建目录的 dev/inode；仅当路径仍指向同一真实目录且 `rmdir` 证明为空时清理；替换路径、部分 owner 元数据及损坏锁均保留；写入失败后可重试 | 已验证 |

第十一轮定向验证：通过真实文件系统故障注入覆盖 owner 写入失败后的空目录重试、符号链接替换和损坏 metadata 替换，共 3 项测试；在旧递归清理实现下后两项稳定失败（替换状态被删除），修复后全部通过。

## 第十二轮交付：创建 partial target 的显式恢复

通过构建后的真实 API/CLI 复现了创建进程中断：模板包含大量文件时，在目标 ownership marker 已写入、文件尚未全部发布的窗口发送 `SIGKILL`，目标目录与 staging 同时残留；下一次创建只能报告“目标目录已存在”，而现有 `inspectCreateTarget()` 只能观察，无法在确认用户编辑后安全重试。

| 优先级 | 工作项及问题依据 | 验收条件 | 状态 |
| --- | --- | --- | --- |
| P1 | SIGKILL 后 partial target 阻塞重试，自动猜测归属会误删用户文件 | `recoverCreateTarget()` 支持 dry-run；只清理与 staging 快照相同且未被改动的生成文件；用户编辑/新增文件、缺失 staging 和 marker 变化均保留；target/staging 根目录替换、嵌套 staging、目录 mtime 变化和 rmdir 竞态均安全；公开类型有 monorepo/repoctl tsd 覆盖 | 已验证 |

新增恢复 API 按文件内容和符号链接目标与 staging 快照逐项比较，只有目标完全清空时才移除 target 与 staging；恢复过程发现用户文件或并发变更时保留 ownership marker 和证据。target/staging 每次读取和清理前复核 dev/inode，避免跟随替换路径；恢复 marker 时使用独占写入，不覆盖并发创建的文件。第十二轮定向验证：create recovery 共 27 项通过（含真实文件系统快照、嵌套目录、用户编辑保留、staging 缺失、target/staging 替换、rmdir 竞态和 dry-run）；`monorepo` typecheck、受影响 ESLint 与 `rtk git diff --check` 通过，中英文包 README 与 monorepo/repoctl tsd 类型断言已同步。CLI 命令仍待后续根据用户恢复习惯决定是否加入，当前 API 不自动猜测或删除未知内容。

## 第十三轮交付：升级锁原子初始化

继续复查升级锁的进程终止窗口时发现，目录创建和 `owner.json` 写入之间的窗口仍可能留下空锁，后续调用只能把它视为缺失 owner 的损坏状态。锁初始化现在先在唯一 pending 目录写入并校验 owner，再以目录 rename 原子发布；竞争失败只清理自身、身份仍匹配的 pending 目录。

| 优先级 | 工作项及问题依据 | 验收条件 | 状态 |
| --- | --- | --- | --- |
| P1 | owner 写入前进程终止会留下不可区分的空锁；竞争清理可能误删替换后的 pending 路径 | owner 写入失败时目标锁路径保持不存在；rename 竞争处理 EEXIST/ENOTEMPTY/EPERM；pending 被替换为符号链接、损坏 metadata 或其他 inode 时保留；既有损坏锁仍报告稳定错误 | 已验证 |

第十三轮定向验证：锁与 journal 13 项通过，受影响 ESLint 与 `git diff --check` 通过。

## 第十四轮交付：发布识别与创建恢复 CLI

真实 workflow 形态复查发现，发布步骤可能使用 quoted/inline YAML、`- run:` 或 block scalar；只做文本匹配会漏迁移或把 `echo` 中的命令误判为受管。发布识别现在先按 YAML 结构判断，再对损坏或编辑中的文档使用保守回退。第十二轮的创建恢复 API 也补上显式 CLI 入口，避免 SIGKILL 后用户只能重新创建并收到“目标已存在”。

| 优先级 | 工作项及问题依据 | 验收条件 | 状态 |
| --- | --- | --- | --- |
| P1 | 常见 Changesets workflow 结构被误判；自定义 shell 文本可能触发迁移；stale create marker 没有用户可调用的恢复入口 | 正确识别 quoted、inline、`- run`、`with.publish` 和 block scalar；`echo` 等仅提及命令的自定义步骤保留；`repo recover`、`recover-create`、`repo new --recover` 和 `repo package create --recover` 支持安全恢复、干跑和稳定 JSON 结果 | 已验证 |

第十四轮定向验证：release migration 7 项、CLI recovery 与 program wiring 4 项通过；恢复全套 35 项覆盖 macOS `/var` 与 `/private/var` 别名，受影响 ESLint、monorepo typecheck/build 和 `git diff --check` 通过。CLI 默认只删除仍匹配 staging 快照的文件，`--dry-run`、`--json` 和 `--out` 不修改目标工程。

## 第十五轮交付：升级状态与 workspace manifest 诊断

继续用真实临时工程复查 `repo doctor` 的只读诊断边界。升级锁或事务 journal 残留时，原报告无法区分可回收锁、正在运行的升级和需要人工复核的状态；workspace 扫描遇到根配置或无关包的损坏清单时也可能直接抛错。另复现出合法 YAML 中 `packages: false`、非字符串数组和非 mapping 文档会被静默当成 pnpm 默认规则，导致 doctor 与 create 对同一配置给出不同结论。

| 优先级 | 工作项及问题依据 | 验收条件 | 状态 |
| --- | --- | --- | --- |
| P1 | upgrade lock/journal 需要只读人工诊断，并兼容 macOS `/var` 与 `/private/var` 别名 | 提供 `inspectUpgradeLock` 状态 API；doctor 仅在异常时增加稳定 `upgrade-lock` / `upgrade-transactions` 检查；active/malformed/pending 阻断提示，stale 可回收告警，健康报告字段保持稳定 | 已验证 |
| P1 | doctor 的 pnpm broad discovery 不能因无关损坏 `package.json` 或损坏根清单崩溃 | 保留可发现包并输出稳定 `workspace-package-discovery` 或 `package-json` fail，JSON/Markdown 均可解析且包含修复建议 | 已验证 |
| P1 | doctor 与 create 对非法 workspace manifest 的语义不一致 | 共享 mapping、`packages` 字符串数组和默认规则校验；`packages: false`、非字符串数组、非 mapping 统一报告 `workspace-manifest` fail，空文档和缺少字段仍使用 pnpm 默认 | 已验证 |

第十五轮完整验证：19/19 build、17/17 lint、全仓 typecheck、6/6 tsd、133 个测试文件 / 871 个测试和 2 个开发场景 / 4 个测试通过；packaged-create、packaged-doctor（10 pass / 0 warn / 0 fail）、Worker 类型、workflow 合同、无追踪构建产物、`pnpm change check` 和 `git diff --check` 均通过。新增 doctor 回归定向测试 25 项覆盖损坏 root/package、非法 workspace manifest、升级锁与事务状态。

## 第十六轮交付：恢复竞争与诊断输入校验

第十五轮后的只读审查又复现了三个边界：stale upgrade lock 的接管窗口可能把已替换的 foreign lock 当成旧锁删除；合法 JSON 但顶层不是对象、`engines.node` 不是有效 semver 时 doctor 仍可能抛错；picomatch 对未闭合 glob 默认按字面处理，导致 workspace 配置错误无法被稳定诊断。锁模块同时因竞争保护增长超过 300 行，继续拆分 owner 校验与 inspection。

| 优先级 | 工作项及问题依据 | 验收条件 | 状态 |
| --- | --- | --- | --- |
| P1 | stale lock 接管的 rename 后路径可能已被替换，inode 复用还会绕过单一身份检查 | tombstone 同时校验目录身份与 owner id/pid/创建时间；替换目录、foreign metadata 和并发 owner 均保留，不递归删除未知内容；新增真实竞争回归 | 已验证 |
| P1 | 根 package.json 顶层值、engines.node 类型或 semver 损坏会让 doctor 无报告 | 根清单必须是对象；非法 engines.node 输出稳定 `node-version` fail 和修复建议，JSON/Markdown 仍可解析 | 已验证 |
| P1 | 未闭合 workspace glob 可能静默失效或在发现阶段抛错 | 使用严格括号校验，非法 pattern 在写入/诊断前转为稳定 `workspace-manifest` fail；已有 pnpm glob 和默认规则保持兼容 | 已验证 |
| P2 | lock 竞争与只读 inspection 共处一个超长模块 | 拆出 `lock/owner.ts`、`lock/inspect.ts`，核心锁模块低于 300 行，公开导出与类型断言不变 | 已验证 |

第十六轮最终门禁：19/19 build、17/17 lint、全仓 typecheck、6/6 tsd、133 个测试文件 / 878 个测试和 2 个开发场景 / 4 个测试通过；packaged-create、packaged-doctor（10 pass / 0 warn / 0 fail）、Worker 类型、workflow 合同、无追踪构建产物、`pnpm change check` 和 `git diff --check` 均通过。packaged-create、packaged-doctor 与 Worker 类型检查按顺序执行，避免模板资产 prepack 竞争；本轮新增锁竞争、根 manifest、Node 版本和 glob 诊断回归均包含在完整测试中。

## 第十七轮交付：逐 manifest 容错发现

复现发现：pnpm 的批量 workspace 扫描使用全量 Promise 过滤，配置 pattern 内任意一个损坏的 `package.json` 都会让同一 pattern 的合法包一起丢失。此前 doctor 虽然能把 broad scan 的异常转换成稳定诊断，但 `packageCount` 和覆盖检查仍看不到配置范围内的合法包；根清单损坏时也会出现同样问题。

| 优先级 | 工作项及问题依据 | 验收条件 | 状态 |
| --- | --- | --- | --- |
| P1 | 配置 pattern 或根目录包含损坏 manifest 时，pnpm 批量发现整体 reject，doctor 丢失可发现包 | 逐个扫描 package.json/package.yaml/package.json5；合法包保留在 packageCount 和 workspace coverage，坏文件路径进入稳定 `workspace-package-discovery` fail；根 manifest 损坏、同 pattern good+bad 与 broad junk 均不崩溃 | 已验证 |

第十七轮最终门禁：19/19 build、17/17 lint、全仓 typecheck、6/6 tsd、133 个测试文件 / 879 个测试和 2 个开发场景 / 4 个测试通过；packaged-create、packaged-doctor（10 pass / 0 warn / 0 fail）、Worker 类型、workflow 合同、无追踪构建产物、`pnpm change check` 和 `git diff --check` 均通过。doctor manifest/pattern 定向回归 25 项（含两条逐 manifest 容错场景）全部通过。

## 第十八轮交付：升级事务清理竞态与初始化失败

继续复查升级事务的文件系统边界时复现了两个风险：事务目录在清理前被替换为外部目录时，按路径递归删除可能误删外部内容；backup 目录创建已经完成但调用报告失败时，初始化目录可能残留，影响后续诊断和重试。事务根目录创建还需要避免在检查与 `mkdir` 之间跟随新插入的符号链接。

| 优先级 | 工作项及问题依据 | 验收条件 | 状态 |
| --- | --- | --- | --- |
| P1 | cleanup 的 transaction 路径可在 lstat 后被替换，递归删除会触碰 foreign directory；tombstone 本身也可能被替换 | 记录 transaction 目录 dev/inode；清理前原子改名到 tombstone 并二次校验身份；foreign replacement、sentinel 内容和父目录均保留 | 已验证 |
| P1 | backup mkdir 在目录创建后报告失败时，旧 catch 没有身份信息，可能留下无 journal 的残留目录 | 先逐级创建 `.repoctl/transactions` 与唯一 transaction 目录，记录身份后创建 backups；失败只清理已确认归属的目录，未知 foreign 路径保留，成功后无 pending journal | 已验证 |
| P1 | transaction root 在检查和递归 mkdir 之间被替换为 symlink，可能把事务写入 workspace 外 | 使用非递归逐级 mkdir，symlink/replacement 使创建失败；外部 sentinel 保留且目标工程无写入 | 已验证 |

第十八轮完整验证：19/19 build、17/17 lint、全仓 typecheck、6/6 tsd、134 个测试文件 / 888 个测试和 2 个开发场景 / 4 个测试通过；journal/transaction、release migration 和 upgrade plan 定向回归 48 项；packaged-create、packaged-doctor（10 pass / 0 warn / 0 fail）、Worker 类型、workflow 合同、无追踪构建产物、`pnpm change check` 和 `git diff --check` 均通过。事务实现保持 300 行以内，原始 checkout 的 `templates/nimbus/` 未修改。

## 第十九轮：升级预览资产准备一致性

构建产物复现出升级入口之间的差异：执行 `upgradeMonorepo()` 会先准备安装包模板资产，但程序化 `resolveUpgradePlan()` 和 CLI 预览直接读取 `assetsDir`。安装包资产被移走或尚未准备时，执行路径能够恢复，预览却提前失败；这会让预览无法代表实际执行结果。

| 优先级 | 工作项及问题依据 | 验收条件 | 状态 |
| --- | --- | --- | --- |
| P1 | upgrade 计划解析未复用执行路径的模板资产准备，资产缺失时 dry-run 与执行结果不一致 | 计划 API 在读取模板前等待统一资产准备；预览只读目标工程；资产缺失/重建场景与执行路径一致，并有构建入口回归 | 已验证 |

第十九轮定向验证：资产准备与升级计划 17 项通过；monorepo build、受影响 ESLint 和 typecheck 通过。执行入口和计划 API 均能在安装包资产暂缺时准备模板，dry-run 不写目标工程。

## 第二十轮：升级锁释放的替换竞态

进一步故障注入发现，升级锁释放先读取 `owner.json` 再按可见路径删除；并发进程可以在读取后替换该路径，旧实现可能递归删除 foreign lock 或其 sentinel 文件。释放现在记录目录身份，通过私有 tombstone 原子移动并再次校验 inode/dev 与 owner，只有仍属于本次锁的 tombstone 才会清理；替换或损坏状态会恢复/保留并报告稳定错误。

| 优先级 | 工作项及问题依据 | 验收条件 | 状态 |
| --- | --- | --- | --- |
| P1 | release lock 的路径检查与删除之间存在 TOCTOU，foreign replacement 可能被误删 | replacement-after-rename、损坏 owner 和 rename 竞态均保留 foreign lock；正常释放仍清理父目录；锁模块按职责拆分且核心文件低于 300 行 | 已验证 |

第二十轮完整验证：19/19 build、17/17 lint、全仓 typecheck、6/6 tsd、135 个测试文件 / 890 个测试和 2 个开发场景 / 4 个测试通过；lock、doctor、upgrade plan 定向回归通过。packaged-create、packaged-doctor（10 pass / 0 warn / 0 fail）、Worker 类型、workflow 合同、无追踪构建产物、`pnpm change check` 和 `git diff --check` 均通过。原始 checkout 的 `templates/nimbus/` 未修改。

## 第二十一轮：创建 staging 与升级回滚的替换竞态

继续对失败清理和回滚进行真实文件系统故障注入，复现出两处会误触碰并发内容的窗口：创建失败后的 staging 路径可能在 `finally` 清理前被用户或其他进程替换；升级删除已完成后用户重新创建同名文件，或写入后 inode 被替换，旧回滚逻辑会静默跳过并丢失人工复核信号。

| 优先级 | 工作项及问题依据 | 验收条件 | 状态 |
| --- | --- | --- | --- |
| P1 | create/stale staging 清理按可见路径递归删除，替换后可能误删 foreign 目录 | 记录 staging dev/inode；清理前 rename 到私有 tombstone 并二次校验；foreign replacement 保留，清理失败可恢复；创建失败和 stale 启动清理均覆盖竞态 | 已验证 |
| P1 | upgrade rollback 仅按路径/内容猜测归属，删除后用户重建或写入后 inode 改变可能静默丢失 journal | afterIdentity 或 after 内容不匹配时保留用户状态并将事务标为 `needs-review`；正常回滚仍恢复原文件 | 已验证 |

第二十一轮定向验证：create recovery 与 upgrade transaction 竞态共 32 项通过；monorepo typecheck、受影响 ESLint 与 `git diff --check` 通过。新增测试按职责拆分到 `create/recovery/` 与 `upgrade/transaction/` 目录，生产实现均保持 300 行以内。

## 第二十二轮：发布资产不携带源码变更意图

消费者 tarball 复现出模板资产会原样携带源码仓库 `.changeset/*.md`，生成项目第一次执行 change/release 时会消费无关的内部包变更说明。发布清理现在删除 ledger 和所有变更意图 markdown，同时保留配置及其他非 intent 元数据；新增文件系统测试验证清理边界，并在实际生成项目中确认 `.changeset` 不含源仓库 intent。

| 优先级 | 工作项及问题依据 | 验收条件 | 状态 |
| --- | --- | --- | --- |
| P1 | tarball/生成项目携带源码 `.changeset/*.md`，消费者 release 会读取错误的包和摘要 | 资产准备删除 ledger 及所有 `.changeset/*.md`，保留 config 等非 intent 元数据；prepare、tarball 和 create 消费者回归通过 | 已验证 |

第二十二轮定向验证：monorepo-templates prepare 测试 6/6、lint 与 typecheck 通过；`sync:assets` 后资产和实际生成项目均无源码 changeset intent。

第二十一、二十二轮合并门禁：19/19 build、17/17 lint、全仓 typecheck、6/6 tsd、137 个测试文件 / 894 个测试和 2 个开发场景 / 4 个测试通过；packaged-create、packaged-doctor（10 pass / 0 warn / 0 fail）、Worker 类型、workflow 合同、无追踪构建产物、`pnpm change check` 和 `git diff --check` 均通过。构建与既有 lint 仅保留仓库原有的依赖替换提示；原始 checkout 的 `templates/nimbus/` 未修改。

## 第二十三轮：创建清单校验与升级写入竞态

继续用临时工程和故障注入审查创建与升级的最后几个写入窗口。复现发现 create 在读取 `pnpm-workspace.yaml` 后没有复用 doctor 的严格 glob 校验，未闭合 pattern 会被当作普通不匹配字符串并在后续静默追加；staging 清理在可见路径被替换时也需要统一的身份校验。升级迁移则可能在预检后看到未选中的依赖文件已被用户修改，仍继续删除旧发布状态；升级创建父目录后若被替换为 symlink，原子写入前必须再次检查。

| 优先级 | 工作项及问题依据 | 验收条件 | 状态 |
| --- | --- | --- | --- |
| P1 | create 与 doctor 对非法 workspace glob 的行为不一致 | create 写 manifest 前调用共享严格括号校验；`packages: ["["]` 在任何写入前稳定失败，原 manifest 保持不变 | 已验证 |
| P1 | create 失败或 stale cleanup 的 staging 路径可在检查后被 foreign 目录替换 | 复用身份校验与 tombstone 清理；foreign replacement、sentinel 内容和本次创建的用户文件均保留；`stagingRemoved` 只在路径确认消失时为 true | 已验证 |
| P1 | upgrade 迁移依赖在预检后被修改仍可能触发旧发布状态删除 | 每个 mutation 前重新验证未选中依赖及其父目录；依赖变化时先回滚已写入操作并保留用户编辑，旧状态不删除 | 已验证 |
| P1 | upgrade 创建父目录后到原子写入之间存在 symlink TOCTOU | mkdir 后再次检查完整父目录链；替换为外部 symlink 时升级失败，外部目录无新文件且事务可诊断 | 已验证 |
| P2 | stale lock 接管路径的完整 `lstat` 结果被误标成身份类型 | 使用完整 stat 类型保留文件类型检查；monorepo typecheck 与 tsd 无错误 | 已验证 |

第二十三轮定向验证：create workspace/recovery、upgrade transaction/races、release migration、doctor patterns 共 6 个文件 / 59 项通过；全仓 `pnpm test` 通过 137 个测试文件 / 901 项和 2 个开发场景 / 4 项。随后按 build → lint → typecheck → tsd 复验，19/19 build、17/17 lint、TypeScript 无错误、6/6 tsd 通过；packaged-create、packaged-doctor（10 pass / 0 warn / 0 fail）、Worker 类型、workflow 合同、无追踪构建产物、2 个 changeset intent 检查和 `git diff --check` 均通过。原始 checkout 的 `templates/nimbus/` 未修改。

## 第二十四轮交付：doctor 自定义 workspace tooling 发现

只读审查发现 doctor 的 legacy tooling 检查仍假设包只位于 `apps/`、`packages/` 和 `examples/`，因此合法的 `modules/`、`services/` 等自定义 workspace 中的 `eslint.config.js` 或 `vitest.config.ts` 会被静默漏报。workspace 发现结果已经由 pnpm 规则计算，tooling 检查应复用这份实际包列表，根目录配置仍单独保留。

| 优先级 | 工作项及问题依据 | 验收条件 | 状态 |
| --- | --- | --- | --- |
| P1 | doctor 硬编码 conventional workspace 目录，无法诊断自定义 workspace 包中的旧 tooling 导入 | 使用实际发现的 workspace 包目录扫描包级 tooling；`modules/**` 等自定义布局中的 legacy 配置输出稳定 `tooling-imports` 警告并给出迁移建议；传统布局和根配置行为保持兼容 | 已验证 |

第二十四轮定向验证：doctor 测试 10/10、升级锁/journal 与 doctor 定向测试共 28 项通过；monorepo typecheck、受影响 ESLint 和 `git diff --check` 通过。改动仍保留在隔离 worktree，未提交、未发布。

## 第二十五轮交付：创建恢复的部分清理

故障场景复现出恢复流程的过度保守分支：目标同时包含用户编辑/新增文件和仍与 staging 快照一致的生成文件时，分析阶段只要发现一个需保留文件就提前返回，导致可证明归属的生成文件也无法清理。恢复现在仅在 dry-run 分析后返回；实际执行会删除匹配快照的文件，保留用户文件、ownership marker 和 staging 证据，供后续继续处理。

| 优先级 | 工作项及问题依据 | 验收条件 | 状态 |
| --- | --- | --- | --- |
| P1 | partial create 恢复遇到用户编辑时跳过全部清理，重复重试仍被无关生成文件阻塞 | 混合目标中删除未修改生成文件，保留编辑/新增文件与 marker/staging；完整目标仍可移除；dry-run 仍只读并报告全部拟删除项 | 已验证 |

第二十五轮定向验证：create recovery target 与 CLI recovery 共 13/13、build 19/19 通过；改动仍保留在隔离 worktree，未提交、未发布。

第二十四、二十五轮完整门禁：build 19/19、lint 17/17、TypeScript 无错误、tsd 6/6、137 个测试文件 / 902 项和 2 个开发场景 / 4 项通过；packaged-create、packaged-doctor（10 pass / 0 warn / 0 fail）、Worker 类型、workflow 合同、无追踪构建产物、2 个 changeset intent 与 diff 检查通过。升级状态只读诊断已在第十五轮记录，本轮未重复计为新功能。

## 第二十六轮：升级迁移尊重文件选择

构建产物回归复现：配置 `commands.upgrade.targets` 且 `mergeTargets: false` 排除 `package.json` 时，发布迁移仍会把它追加为写入操作并移除 Changesets 依赖。迁移现在先核对所需目标；缺少 workspace、已有 package manifest 或尚未迁移的 workflow 时，保留旧发布状态并使用稳定原因 `migration-targets-not-selected`。已受管且未选中的 workflow 仍可作为只读依赖。

| 优先级 | 工作项及问题依据 | 验收条件 | 状态 |
| --- | --- | --- | --- |
| P1 | release migration 隐式写入被显式排除的 package.json | 逐项排除必需文件时不越过选择边界，旧配置和 pre 状态保留；已受管 workflow 不选中仍可完成迁移；预览前后整个目标工程快照一致 | 已通过完整门禁 |

新回归在旧构建产物上 2 项失败、2 项通过；修复后 upgrade targets、plan、overwrite 和 release migration 共 4 文件 / 37 项通过。中英文 README、网站命令参考及公开命令说明已同步；doctor tooling 测试已拆到 `test/commands/doctor/`，触及文件均低于 300 行。

## 第二十七轮：保留中断创建的恢复快照

真实临时工程复现：另一包创建触发 `cleanupStaleCreateStaging()` 后，两天前的中断 target 仍然存在，但它的 staging 被删除，`recoverCreateTarget()` 因缺少快照无法恢复。自动清理应只回收确定没有目标残留的 staging，保留有目标、损坏标记或无法确认状态的恢复证据。

| 优先级 | 工作项及问题依据 | 验收条件 | 状态 |
| --- | --- | --- | --- |
| P1 | 后续 create 自动回收仍被 interrupted target 需要的 staging | 新建另一包后快照仍在，显式 recover 可以继续；目标或 marker 损坏时保守保留；没有目标残留的 stale staging 仍清理 | 已通过完整门禁 |

第二十七轮定向验证：recovery 共 5 个文件 / 40 项通过，包含 6 项构建产物消费者回归；monorepo build、ESLint 和 TypeScript 检查均通过。

第二十四至二十七轮最终完整门禁：在静态工作树上按 build → lint → typecheck → tsd → test 执行，build 19/19、lint 17/17、TypeScript 无错误、tsd 6/6、140 个测试文件 / 912 项和 2 个开发场景 / 4 项全部通过。随后顺序执行 packaged-create、packaged-doctor（10 pass / 0 warn / 0 fail）和 Worker 类型回归，均通过；workflow 合同、无追踪构建产物、2 个 change intent 检查与 `git diff --check` 通过。验证环境为本机 macOS / Node 24；保留三平台 × Node 22/24 CI 配置，本轮未触发远端 CI。原始 checkout 的 `templates/nimbus/` 仍为原有未跟踪目录，未修改。所有改动保持本地未提交，goal 保持 active。

## 第二十八轮：进程中断后的 workspace manifest 恢复

真实构建产物子进程在 manifest commit 后、target marker 移除前直接退出，旧恢复流程会删除 target 和 staging，却保留本次追加的 `services/api` workspace 规则。根因是 manifest 的原内容和提交身份只存在内存中，无法用于下一进程恢复。

| 优先级 | 工作项及问题依据 | 验收条件 | 状态 |
| --- | --- | --- | --- |
| P1 | create 在提交 manifest 后中断会丢失回滚信息 | 发布 target 前写入独立恢复记录，保存原内容、提交内容、文件身份和权限；既有/新建 manifest 均可恢复；恢复本身中断或写入失败仍能重试 | 已通过完整门禁 |
| P1 | 恢复不能覆盖用户改动或撤销仍有用户文件的 workspace inclusion | 内容、inode、symlink、恢复记录不可信时保留；partial target 可清理匹配文件但保留 manifest、marker 和 staging；整个工程预览只读 | 定向通过 |
| P2 | 旧事务无 manifest 记录，需要明确兼容语义 | 新 marker v2 要求持久记录，v1 继续 target-only 恢复并报告 `manifest.status: unknown`；同步 CLI、公开类型测试和中英文文档 | 定向通过 |

新增 16 项构建产物回归使用独立子进程模拟未运行 catch/finally 的退出，覆盖创建提交前后、恢复再次中断、写入失败、用户编辑/替换/软链接、保留文件、预览、权限和旧版本。实现按 manifest 记录/检查/执行以及 target 收尾职责拆分，相关生产代码均低于 300 行。定向 build、ESLint、TypeScript、两个公开入口的 tsd 与 recovery 回归通过。

第二十八轮完整门禁：build 19/19、lint 17/17、TypeScript 无错误、tsd 6/6；142 个测试文件 / 931 项和 2 个开发场景 / 4 项通过。packaged-create（生成项目 build/lint/typecheck/tsd/test）、packaged-doctor（10 pass / 0 warn / 0 fail）、Worker 类型回归、workflow 合同、无追踪构建产物、2 个 change intent 与 diff 检查均通过。完整日志位于 `/var/folders/nc/lnt357c50gdcwqlvymm9jn040000gn/T/repoctl-round28-gates-7qkaqqpl`。验证环境为本机 macOS / Node 24；三平台 × Node 22/24 CI 配置保留，未触发远端 CI。原始 checkout 的 `templates/nimbus/` 仍为原有未跟踪目录，未修改。本轮提交、发布及对外操作均未执行，goal 保持 active。

下一轮已具备复现证据：公开 `getWorkspacePackages()` 直接接收路径别名时，以词法 workspaceDir 对比 pnpm 返回的物理根目录，默认 `ignoreRootPackage` 未排除根包。临时目录实际生成一个 root 包和一个 child 包后，直接 API 返回两包；同参数经 `getWorkspaceData()` 返回一个 child 包。先补构建产物回归，再统一路径身份处理。

## 第二十九轮：workspace API 的目录别名边界

通过构建产物真实调用发现：`getWorkspacePackages()` 直接接收目录 symlink 或 macOS `/var` 别名时，默认结果错误包含根包。根因是输入和缓存采用词法路径，而 pnpm 发现结果采用物理路径；无 manifest 的 fallback 摘要也可能产生跨目录相对路径，alias 改指其他工程时会复用旧 workspace 发现结果。

| 优先级 | 工作项及问题依据 | 验收条件 | 状态 |
| --- | --- | --- | --- |
| P2 | workspace API 根包过滤、摘要和缓存对路径别名采用不同身份 | 在 manifest/包发现前统一物理路径；调用者 `cwd` 保留原绝对路径；fresh physical cache key 能识别重定向 alias；private/patterns、显式根包、缺失目录及错误行为保持兼容 | 已通过完整门禁 |

新增 8 项构建产物回归，旧实现 4 失败 / 4 通过；覆盖真实 alias、物理目录、显式选项、无 manifest fallback、alias 重定向、空目录、缺失目录和普通文件路径。两包公开 tsd、中英文 README 和既有发布意图已同步。完整门禁中发现并修正两处测试适配：负向 tsd 改用 `expectNotAssignable` 以兼容 repoctl 的常规 tsc；既有 upgrade cache 回归显式请求根包，避免依赖旧 alias 过滤缺陷。

第二十九轮完整门禁：build 19/19、lint 17/17、全仓 typecheck 无错误、tsd 6/6；143 个测试文件 / 939 项与 2 个开发场景 / 4 项通过。packaged-create（生成项目 build/lint/typecheck/tsd/test）、packaged-doctor（10 pass / 0 warn / 0 fail）、Worker 类型回归、workflow 合同、无追踪构建产物、2 个 change intent 与 diff 检查均通过。完整日志（保留首次失败和修正后的通过记录）位于 `/var/folders/nc/lnt357c50gdcwqlvymm9jn040000gn/T/repoctl-round29-gates-zx9nrkhg`。本轮测试适配后只重跑受影响的静态检查和剩余门禁；生产构建未再变动。验证环境为本机 macOS / Node 24，三平台 × Node 22/24 CI 配置保留且未触发远端 CI。原始 checkout 的 `templates/nimbus/` 未修改，代码保持本地未提交，goal 保持 active。

下一轮证据已由主代理复跑确认。脚本 `/tmp/repoctl-alias-audit.3HC2Tp/reproduce.mjs` 使用构建产物和临时 Git 工程，无需联网并在结束后清理 fixture：alias cwd + physical 绝对 workspace 列表的 pre-push 仅运行根 lint/typecheck；physical cwd 控制组及 alias 的默认/relative 参数均运行完整 5 项。create 期望 `services/new`，实际 `repository.directory` 为 `../alias/services/new`；init 期望 `services/api`，实际 metadata 和 README 链接均为 `../workspace/services/api`。源码边界位于 `verify/pre-push.ts` / `verify/tasks.ts`、`create/metadata.ts`、`init/setPkgJson.ts` / `init/setReadme.ts`。公开 workspaces 参数未限制为相对路径，已有实现也明确接受绝对路径。

## 第三十轮：命令层统一路径别名身份

第二十九轮留下的复现脚本在本轮开始再次确认三处错误：显式 physical workspace 列表的 pre-push 在 alias cwd 下漏掉包 build/tsd/test；create 和 init 写出的 repository.directory 指向别名路径；init README 链接也错误地跨目录。共享路径解析现在对尚未创建或已删除的末段寻找最近可解析祖先，再还原尾段，支持创建规划与删除归属。

| 优先级 | 工作项及问题依据 | 验收条件 | 状态 |
| --- | --- | --- | --- |
| P1 | pre-push 显式路径与 cwd 别名没有使用同一文件系统身份 | 相对、物理绝对和 alias 绝对目录进入同一归属计算，保持最长匹配、去重、删除路径、显式 cwd 边界；排除外部目录及其链接 | 已通过完整门禁 |
| P1 | create/init 元信息混用词法路径和 Git 物理根 | repository.directory 相对物理 Git 根；支持 nested workspace、内部父目录别名及尚不存在的目标；缺 Git 根时回退 workspace | 已通过完整门禁 |
| P2 | init README 链接基准错误 | README 仍写入传入 cwd，链接相对其物理目录；嵌套 init 不修改父 workspace；已有 README 默认保留，重复执行稳定 | 已通过完整门禁 |

新增 15 项构建产物回归（pre-push 9 项、元信息 6 项）；元信息在旧构建上 6 项全失败，修复后相关 19 文件 / 135 项均通过。原始复现脚本复跑后，四种 pre-push 调用均执行完整 5 项任务，create/init 的 repository.directory 和 README 链接均等于预期。build、相关 ESLint、TypeScript、两包 tsd 通过；双语 README、网站/skill 命令说明与既有发布意图已同步。旧 init 测试 fixture 补上实际新增使用的 Git getRepoRoot 方法，生产代码没有为不完整 mock 加可选调用分支。

第三十轮完整门禁：build 19/19、lint 17/17、全仓 typecheck 无错误、tsd 6/6；145 个测试文件 / 954 项与 2 个开发场景 / 4 项通过。packaged-create（生成项目 build/lint/typecheck/tsd/test）、packaged-doctor、Worker 类型回归、workflow 合同、无追踪构建产物、2 个 change intent 与 diff 检查均通过。日志位于 `/var/folders/nc/lnt357c50gdcwqlvymm9jn040000gn/T/repoctl-round30-gates-fhnpgzgl`。验证环境为本机 macOS / Node 24；三平台 × Node 22/24 CI 保留，未触发远端 CI，原始 checkout 的 `templates/nimbus/` 未修改。

## 第三十一轮：README 路径输出编码

主代理复跑 `/tmp/repoctl-readme-links-audit.A46Y1f/reproduce.mjs`：用 built initMetadata 创建真实工程，再由现有 VitePress 使用的 markdown-it 解析 README。9 种合法目录中，空格和未闭合左括号无法生成链接，右括号截断目标，`#` / `?` 被当作 fragment/query，字面 `%23` 被错误解码。普通、中文和平衡括号为控制组。

| 优先级 | 工作项及问题依据 | 验收条件 | 状态 |
| --- | --- | --- | --- |
| P2 | filesystem 相对路径直接插入 Markdown，特殊字符被解释为语法或 URL 控制字符 | README 链接逐路径段编码，保留目录层级与父级语义；实际解析后 URL pathname 解码等于原目录且无 fragment/query；repository.directory 仍为原始路径；已有 README 保留、强制重建与重复执行稳定 | 已通过完整门禁 |

解析器仅用作测试开发依赖，生产无需新增运行时依赖。新增 13 项构建产物回归，在旧构建上 8 项失败、5 项通过，覆盖真实 Markdown 解析后的 URL 指向、嵌套及父级路径、原始 repository.directory、已有 README 保留与强制重建。实现只在 README 输出边界逐路径段编码，定向 5 文件 / 27 项以及 build、ESLint、typecheck、tsd 已通过。

完整门禁首次运行的 146 个文件 / 967 项中，仅既有 metadata 消费者测试超过默认 5 秒（966 项通过）。定向 11 项通过；进一步审查发现 fixture 每个顶层依赖分别重置 seen，重复复制共享闭包。共享 seen 后每例从 37 次目录复制降为 17 次，核实当前所有依赖无同名版本冲突；补 setup 失败清理、Node 子进程 10 秒超时及仅此集成套件 30 秒预算。所有并发准备操作先 settle 再处理错误，避免清理时仍有未结束的写入。生产构建未改动，fixture 的 ESLint、typecheck、11 项定向回归及完整测试复验均通过。

第三十一轮完整门禁：build 19/19、lint 17/17、全仓 typecheck 无错误、tsd 6/6；146 个测试文件 / 967 项与 2 个开发场景 / 4 项通过。packaged-create（生成项目 build/lint/typecheck/tsd/test）、packaged-doctor（10 pass / 0 warn / 0 fail）、Worker 类型回归、workflow 合同、无追踪构建产物、2 个 change intent 与 diff 检查均通过。日志（含首次超时和修复后的复验）位于 `/var/folders/nc/lnt357c50gdcwqlvymm9jn040000gn/T/repoctl-round31-gates-_g4gywjp`。验证环境为本机 macOS / Node 24；三平台 × Node 22/24 CI 配置保留，未触发远端 CI。触及实现和测试均少于 300 行，双语说明与发布意图已同步；原始 checkout 的 `templates/nimbus/` 未修改，改动保持本地未提交，goal 保持 active。

下一候选由主代理复跑 `/tmp/repoctl-readme-text-audit.qJ0ib3/reproduce.mjs` 确认：合法 scoped 包名的前后下划线被解析为 Markdown 强调，标签文字丢失下划线。描述中的 `Promise<T>` 也会在 html 模式下作为 HTML 解析，但需先确认既有 description 是否允许 Markdown；下一轮优先修复契约明确的包名显示。仓库没有通用 Markdown label 转义工具；除 `_` 外，现有 npm validator 接受的 scope 中 `*`、`~` 也会生成强调或删除线，因此应在局部 label 序列化边界处理常规 Markdown 标点，保留 description 既有行为，并验证解析后标签文字严格等于 name、href 仍正确且 manifest.name 不变。

## 第三十二轮：README 包名标签按原文显示

在第三十一轮通过后的构建产物上复跑文本审查脚本，`@scope/_name_` 与 `@scope/__name__` 仍被 Markdown 当作强调，显示/复制的名字均变成 `@scope/name`。npm 包名校验也接受普通名称或 scope 中的下划线，以及 scope 中的星号和波浪号，因此只修复 href 并不能保证包名可辨识。

| 优先级 | 工作项及问题依据 | 验收条件 | 状态 |
| --- | --- | --- | --- |
| P2 | 合法包名的 Markdown 标点改变 README 链接标签 | 在 label 输出边界转义；真实解析后的文字严格等于 manifest.name，无强调/删除线；href 与 package.json 名称保持正确；description 的既有 Markdown 行为、重复执行与强制重建保持兼容 | 已通过完整门禁 |

仅新增内部标签转义，不增加公开 API 或运行时依赖。11 项回归通过 built initMetadata / init 生成真实文件，再用已有测试依赖 markdown-it 检查实际 token 与渲染结果；旧构建 7 项失败、4 项通过。修复后定向 build → ESLint → typecheck → tsd → test 通过，6 个文件 / 38 项均通过。双语 README、网站和公开 skill 描述及发布意图已同步；完整门禁与第三十三轮合并执行。

## 第三十三轮：init 保留 workspace 语义与损坏配置

主代理复跑 `/tmp/repoctl-init-manifest-audit.Z1YfjM/reproduce.mjs` 的 8 个真实构建产物场景：已有 manifest 只有 catalog 时，doctor/create 按 pnpm 隐式 `**` 发现的 modules/api，在 init 后从包数 1 变 0。顶层 scalar/sequence、packages:false 和混合数组被静默重写；非法 glob 被保留却继续生成其他文件；YAML 语法错误且无根 package.json 时，抛错前已写入该文件。合法且完整的规则也被重新序列化，丢失注释。

| 优先级 | 工作项及问题依据 | 验收条件 | 状态 |
| --- | --- | --- | --- |
| P1 | init 在写入前没有与 doctor/create 一致的 manifest 校验 | 共享严格文档、mapping、packages 和 glob 校验；所有非法案例拒绝且整个目标工程无变更，包括根 package.json 不存在；错误契约保持兼容 | 已通过完整门禁 |
| P1 | 已有 manifest 缺 packages 时被默认固定目录规则缩小发现范围 | 区分缺失文件与已有隐式规则：前者新建默认目录，后者保留原文与 pnpm 默认 **，真实包发现与 README 均保留 | 已通过完整门禁 |
| P2 | init 无必要重写有效清单并丢失注释 | 已有显式规则按原文档追加缺失默认规则；无追加时保持字节不变，追加用 YAML Document 保留注释/其他字段；重复执行稳定 | 已通过完整门禁 |

实现按初始化规划/写入与共享校验分工，不新增公开 API；保留 create 事务和 doctor 导出/错误语义。验收从构建产物调用公开初始化入口，使用整个目标工程快照证明失败前不写入。

真实 pnpm 读取进一步区分了空文档与显式 null：空/仅注释文件需要沿用 init 生成默认规则的行为；显式 null Scalar、{} 和 catalog mapping 可采用隐式 ** 并保留原文。按此边界修正回归后，新增 16 项及定向 7 文件 / 72 项全部通过，build、ESLint、typecheck、tsd 通过。

第三十二、三十三轮初次完整门禁已通过：build 19/19、lint 17/17、typecheck 19/19、tsd 6/6，148 文件 / 994 项和 2 文件 / 4 项开发场景测试通过；packaged-create、packaged-doctor（10 pass / 0 warn / 0 fail）、Worker、workflow、artifacts、2 个 change intent 与 diff 检查通过。日志位于 `/var/folders/nc/lnt357c50gdcwqlvymm9jn040000gn/T/repoctl-round32-33-gates-vdbdjyir`。这份验证对应修复 YAML alias 之前的实现，最终验收尚待下面兼容边界收口。

最终审查复现合法 `workspacePatterns: &pkgs [modules/*]`、`packages: *pkgs` 配置：pnpm 能发现包，但 init 和 create 计划在 document.addIn 时都报 Expected YAML collection at packages。追加时应只在 packages 位置物化独立序列，保留原锚点、其他引用和 alias 注释；已覆盖时保持字节不变。此项纳入第三十三轮共享追加边界，增加 built 预览无写入、实际执行、重复初始化和原引用不变回归后再完成最终门禁。

第三十二、三十三轮最终完整门禁（含 alias 修复）：build 19/19、lint 17/17、typecheck 19/19、tsd 6/6，149 文件 / 998 项和 2 文件 / 4 项开发场景测试全部通过；packaged-create、packaged-doctor（10 pass / 0 warn / 0 fail）、Worker 类型回归、workflow 合同、无追踪构建产物、2 个 change intent 与 diff 检查均通过。alias 新增 4 项 built 回归，定向 8 文件 / 76 项通过。最终日志位于 `/var/folders/nc/lnt357c50gdcwqlvymm9jn040000gn/T/repoctl-round32-33-final-gates-l6vohxr2`。验证环境为本机 macOS / Node 24；三平台 × Node 22/24 CI 配置保留，未触发远端 CI。改动保持本地未提交，原始 checkout 的 `templates/nimbus/` 未修改，goal 保持 active。

下一候选：纯解析与 pnpm 实际发现对照表明 `%YAML 1.1` 会让当前 YAML parser 展开 `<<`，但当前 pnpm reader 保留普通字段；同一夹具中发现结果为 1 包与 5 包。显式 `!!merge` 也存在接受/拒绝分歧。脚本 `/tmp/repoctl-workspace-merge-audit.5gfwhtue/reproduce.mjs` 共 7 例；普通无版本指令的 merge 在两者中一致，不能直接启用 merge。下一轮先用公开构建入口复现 doctor/create/init 的用户影响，再决定修复边界。

## 第三十四轮：workspace YAML schema 与 pnpm 一致

构建产物脚本 `/tmp/repoctl-yaml-schema-built-audit.cm0jnho8/reproduce.mjs` 在独立临时工程运行 48 次公开入口调用，覆盖 doctor、create 预览/执行和 initMetadata/init。带 `%YAML 1.1` 的普通 `<<` 字段在当前 parser 中展开、但 pnpm 视为普通数据：doctor 报 1 包而 pnpm 发现 3 包，create 误判未覆盖并实际写出 `packages: services/api` 无效标量。显式 `!!merge` 被 pnpm 拒绝，但旧 doctor/create 接受；已有显式 packages 且无根包时 init 先生成 package.json 才失败。普通 merge、YAML 1.2、显式 packages 与 alias 对照正常。

| 优先级 | 工作项及问题依据 | 验收条件 | 状态 |
| --- | --- | --- | --- |
| P1 | 版本指令和显式标签让写入规划、诊断与 pnpm 实际解析分歧 | init/create/doctor 共用当前 pnpm core 语义；普通 merge 不启用继承；显式数组、标量及 alias 按 pnpm 解读；非法 tag 在任意写入前拒绝；预览/失败完整目录无变化，诊断 ID 不变 | 已通过完整门禁 |

修复范围限于 workspace 规则解析及保留文档的写入边界，不修改普通 package.yaml、发布配置等其他 YAML 消费者。保留当前公开 API、注释和无变更时的原文；用 pnpm reader 作为回归的独立判定依据。

实现选择与当前 pnpm reader 相同版本的 `js-yaml` 作为直接依赖，负责值解析和标签校验；`yaml` 的 core AST 只负责保留注释的编辑，避免自行复制 pnpm 的标签语义。显式整数也委托权威解析器并输出十进制，保留 pnpm 接受的 `!!int 0b10` 和带符号变体，裸二进制仍为字符串。空白文档沿用第三十三轮初始化规则；不把版本指令警告整体升级为错误。纯解析/序列化对照的 162 个整数与版本组合一致。

首批 11 项 built 回归在旧构建上 8 失败 / 3 通过；最终补足至 16 项，涵盖普通 merge、YAML 1.1/1.2/1.3、显式规则、alias、标量保留、非法标签和整个目标工程快照。定向验证发现并修正了空白文档初始化及带符号二进制整数写回两个边界，修复后定向 build → ESLint → typecheck → tsd → test 全部通过，6 文件 / 83 项。定向日志（含初次失败与修正后结果）位于 `/var/folders/nc/lnt357c50gdcwqlvymm9jn040000gn/T/repoctl-round34-targeted-gfyp863f`；最终完整门禁亦已通过。新增实现与测试均低于 300 行，无公开 API 变化；双语 README、网站、公开 skill 说明和既有发布意图已同步。

第三十四轮最终完整门禁：build 19/19、lint 17/17、typecheck 19/19、tsd 6/6；150 文件 / 1014 项和 2 文件 / 4 项开发场景测试全部通过。packaged-create（真实 tarball 生成工程的 build/lint/typecheck/tsd/test）、packaged-doctor（10 pass / 0 warn / 0 fail）、Worker 类型回归、workflow 合同、无追踪构建产物、2 个 change intent 与 diff 检查均通过。日志位于 `/var/folders/nc/lnt357c50gdcwqlvymm9jn040000gn/T/repoctl-round34-gates-fumv2_sp`。验证环境为本机 macOS / Node v24.18.0；三平台 × Node 22/24 CI 配置保留，未触发远端 CI。改动保持本地未提交，原始 checkout 的 `templates/nimbus/` 未修改，goal 保持 active。

下一轮候选：`/tmp/repoctl-catalog-audit.1svt9cjt/reproduce.mjs` 的 16 个纯接口夹具中，11 个损坏 catalog/catalogs 满足当前共享 parser 的全部检查，但实际 pnpm reader 和公开 `validateWorkspaceManifest()` 均拒绝。合法对照包括顶层 null、空 mapping、普通 alias 及空字符串 specifier。当前尚未调用 built repoctl 验证写入影响，待本轮完整验收后继续，不能据此提前声称存在已确认的用户文件变更。

## 第三十五轮：catalog 结构在写入前校验

`/tmp/repoctl-catalog-built-audit.fja6_4ao/reproduce.mjs` 的 9 类配置 / 45 次公开入口调用确认：6 类非法 catalog/catalogs 被 doctor 误报为 `workspace-manifest: pass`，create 预览接受且执行仍写入新包与清单。12 次非法初始化全部失败，其中 8 次在失败前已新增根 package.json、改写 pnpm-workspace.yaml 或两者同时发生；named catalog 为 null 时触发原生 TypeError。合法顶层 null、alias/注释和空字符串 specifier 控制组正常。

| 优先级 | 工作项及问题依据 | 验收条件 | 状态 |
| --- | --- | --- | --- |
| P1 | 共享清单预检只检查 packages，catalog 结构错误在写入后才被 pnpm 发现 | create 计划/执行、initMetadata/init 均在任意写入前拒绝非法 catalog/catalogs；doctor 保持稳定诊断并不崩溃；缺根包、完整规则、隐式规则均覆盖；合法 catalog 保留、修复后可重试 | 已通过完整门禁 |

新增 19 项 built 回归在旧构建上 14 失败 / 5 通过。通过整个工程快照覆盖预览、拒绝和初始化重试；合法 null、空 mapping、alias、空字符串 specifier 以实际 pnpm reader 为独立依据。实现保留已有 mapping/packages/glob 错误边界，再复用 pnpm 的公开 `validateWorkspaceManifest()`；不复制 catalog 规则或增加 semver/引用解析约束。共享解析器的上游已经在每条写入链路之前调用，因此不需要单独扩大创建事务或做事后回滚。

定向 build → ESLint → typecheck → tsd → test 已通过，9 文件 / 112 项；日志位于 `/var/folders/nc/lnt357c50gdcwqlvymm9jn040000gn/T/repoctl-round35-targeted-20ovakx4`。最终复核补充 pnpm 拒绝的空 package rule，以及原有 packages 形状/glob 错误优先级 3 项回归，新增测试共 22 项；这些新增断言随完整门禁全部通过。

第三十五轮最终完整门禁：build 19/19、lint 17/17、typecheck 19/19、tsd 6/6；151 文件 / 1036 项和 2 文件 / 4 项开发场景测试全部通过。packaged-create（真实 tarball 生成工程的 build/lint/typecheck/tsd/test）、packaged-doctor（10 pass / 0 warn / 0 fail）、Worker 类型回归、workflow 合同、无追踪构建产物、2 个 change intent 与 diff 检查均通过。日志位于 `/var/folders/nc/lnt357c50gdcwqlvymm9jn040000gn/T/repoctl-round35-gates-g93a12go`。本轮实现 109 行、新增回归 175 行；未新增公开 API 或依赖，双语 README、网站、公开 skill 和既有发布意图已同步。验证环境为本机 macOS / Node v24.18.0；三平台 × Node 22/24 CI 配置保留，未触发远端 CI。所有改动保持隔离 worktree 的本地未提交状态，原始 checkout 的 `templates/nimbus/` 未修改，goal 保持 active。

下一轮候选：`/tmp/repoctl-round36-schema-probe.mjs` 与 `/tmp/repoctl-round36-schema-evidence.json` 保存了 5 组纯解析及实际 pnpm reader 的前后对照。upgrade/content.ts 和 release-migration.ts 仍使用默认 YAML.parse/stringify；带 YAML 1.1 指令的合法 `packages: [on]` 与 catalog dist-tag `on` 改写后成为布尔值、被 pnpm 拒绝；普通 merge 字段也会从隐式 ** 变成显式 apps/**。metadata 标量与显式二进制整数存在同类变化。当前未调用 built upgrade，下一轮必须先验证公开计划/执行及旧发布状态保留，不能把纯解析结果代替交付证据。模板 sanitizer 的源码也使用默认 parser，但当前受控源清单没有这些语法，暂无需扩展到模板发布链路。

## 第三十六轮：升级清单与发布迁移的语义一致性

`/tmp/repoctl-round36-built-probe.mjs` 的 11 组构建入口复现全部保持预览整树无写入，但实际升级出现以下问题：YAML 1.1 指令下的 packages/catalog `on` 变为布尔值后 pnpm 拒绝；显式二进制整数变为字符串；隐式 ** 发现从 4 包降至 2 包，预发布迁移只给剩余包写 lane 后删除 config/pre；坏 catalog 的 config-only 与 config+pre 也均删除旧状态。拒绝覆盖控制组全树不变，自定义 workflow 保留旧状态但仍可能写坏清单，quoted on 控制组正常。完整 before/preview/after 快照位于 `/var/folders/nc/lnt357c50gdcwqlvymm9jn040000gn/T/repoctl-round36-built-KCQYCV`。

| 优先级 | 工作项及问题依据 | 验收条件 | 状态 |
| --- | --- | --- | --- |
| P1 | 升级使用不同 YAML schema，并用模板 packages 覆盖已有隐式发现语义 | 输入和输出都使用共享 pnpm 语义校验；合法 on、metadata、显式整数和普通 merge 数据不失真；已有合法隐式规则不被补成固定目录；显式数组仍按原合同追加；重复升级稳定 | 已通过完整门禁 |
| P1 | 迁移把“object 可解析”视为有效，坏 catalog 或候选规则未充分检查就删除旧状态 | 原清单和候选清单在写入/删除前完整校验；迁移使用候选 patterns（含 ** 与 []）；非法配置保留全树，拒绝覆盖/自定义workflow/目标选择依赖不变；现有 reason ID 保持稳定 | 已通过完整门禁 |

实现保留纯数据合并合同：目标优先、对象补缺、数组按目标顺序去重追加。升级沿用已有整体格式化输出方式，将权威解析的值交给 core serializer，并重读比较语义；无语义变化时保留原文。此轮不引入通用 YAML AST 图重写。共享 parser 内部返回已验证 manifest 并以错误类型区分 patterns，以保留迁移 reason；release-migration 拆到 workflow/versioning/index，清单合并拆到 workspace 目录，避免继续叠加职责。

本轮新增 20 项回归：首批 11 项构建产物测试在旧实现上 10 失败 / 1 通过，之后补充显式 null、空 mapping、候选与磁盘规则不同、显式空数组和 versioning alias 独立性。最终定向 build → ESLint → typecheck → tsd → test 通过，23 文件 / 169 项；日志位于 `/var/folders/nc/lnt357c50gdcwqlvymm9jn040000gn/T/repoctl-round36-targeted-xjzlya7y`。独立只读复核未发现本轮阻塞遗漏。两包双语 README、网站命令与接入说明、公开 skill 和既有发布意图已同步；本轮生产模块及测试均低于 300 行。

第三十六轮最终完整门禁：build 19/19、lint 17/17、typecheck 19/19、tsd 6/6；154 文件 / 1056 项和 2 文件 / 4 项开发场景测试全部通过。packaged-create（真实 tarball 生成工程的 build/lint/typecheck/tsd/test）、packaged-doctor（10 pass / 0 warn / 0 fail）、Worker 类型与冷构建/缓存回归、workflow 合同、无追踪构建产物、2 个 change intent 与 diff 检查均通过。完整日志位于 `/var/folders/nc/lnt357c50gdcwqlvymm9jn040000gn/T/repoctl-round36-gates-acutgcew`。验证环境为本机 macOS / Node v24.18.0；三平台 × Node 22/24 CI 配置保留，未触发远端 CI。所有改动保持隔离 worktree 的本地未提交状态；原始 checkout 的 `templates/nimbus/` 仍为原有未跟踪目录，未修改；goal 保持 active。

## 下一批证据与实施次序

先处理创建空清单，再处理共享 AST 追加边界。脚本 `/tmp/repoctl-ast-built-audit.1vf6uyu5/reproduce.mjs` 的 14 组 built init/create 对照已重复执行，完整 mode/base64 before、preview、after 快照在 `/tmp/repoctl-ast-built-audit.1vf6uyu5/run-PKTWxH/`，7 次创建预览均无写入。

- 空白/仅注释文件：create 计划均为 `changed: false`，创建成功后 pnpm reader 仍报 `expected a document, but the input is empty`。init 能正常补默认规则；显式 null 控制组正常，应保持其原文及隐式发现。验收包含预览整树无变化、生成后实际 pnpm 读取与发现、注释保留、写入失败回滚及重试。
- AST 引用：`packages: &rules [modules/*]` 被追加时会连带改变 `metadata.rules: *rules`；以 scalar alias 作为 packages 键时，create 写出重复键和错误标量，而 init 在写入前报错。普通 metadata alias 键及显式 bool/float/int 控制组保值。验收要求准确定位语义键，只改变 packages 的预期值；输出完整重读校验在任何目标写入之前完成，已有覆盖及重复执行不改原文。

另一项独立候选来自 `/tmp/repoctl-prepush-refs-probe.mjs`，证据在 `/tmp/repoctl-prepush-refs-VfaADA/results.json`：嵌套 workspace 的路径归属正常，但多个 refs 只合并路径、始终在当前 checkout 执行。真实无依赖脚本证明同一 broken ref 随检出内容变化而被错误放行；所有临时 Git 状态保持不变。该项需要先明确非当前提交的验证边界，再选取有兼容性说明的实现，不能只把路径合并测试当作多分支验证。

## 第三十七轮：创建空清单与规则追加的引用隔离

主代理在当前构建产物上复跑上述 14 组夹具，结果保持一致，完整证据位于 `/tmp/repoctl-ast-built-audit.1vf6uyu5/run-JQtti1/`。本轮先明确写入规划的边界：空/仅注释文档需要初始化；非空显式 null、空 mapping 与省略 packages 的合法文档仍保持隐式发现。规则追加根据语义键定位，变更 packages 时保留其他字段的值，并在任意目标文件写入前验证序列化后的完整清单。

| 优先级 | 工作项及问题依据 | 验收条件 | 状态 |
| --- | --- | --- | --- |
| P1 | create 成功留下 pnpm 不接受的空文档 | 空白/仅注释预览 changed 为 true 且整树无写入；实际新增准确路径、保留注释并可发现新包；null/{} 原文不变；失败回滚、恢复及重试有效 | 已通过完整门禁 |
| P1 | packages 锚点传播到 metadata，别名键被追加为重复键 | 语义键定位唯一规则序列；只有 packages 值追加，其他字段值/类型保持；注释和有效锚点保留，必要时物化引用隔离；未覆盖才改写；完整输出重读复核在写前完成 | 已通过完整门禁 |

共享清单模块现拆为 parse、append 和 content：解析继续采用 pnpm 值语义；追加定位原 mapping pair，遇共享序列仅物化实际指向该节点的引用，保留序列内部 scalar anchor 与同名 anchor 的后续独立定义。输出统一通过 pnpm 重读与完整计划值比较，upgrade 也复用该校验。空文档通过 document contents 判定，不把显式 null 归为空白；无新增公开 API 或依赖。

新增 31 项回归。首批空白清单 9 项在旧构建上 7 失败 / 2 通过，AST 18 项在旧构建上 10 失败 / 8 通过；之后新增空清单持久恢复和同名锚点重定义各 2 项。空清单测试以独立 built 子进程模拟 manifest 提交前/后失败及进程直接退出；AST 测试使用实际 pnpm reader 比较完整清单，并检查预览、注释和重复执行。纯解析复核还确认当前 pnpm 拒绝 sequence mapping key，未将其误当作合法正例或增加无效兼容分支。首次构建和 lint 通过后，TypeScript 指出可变 YAML 节点类型及 exactOptionalPropertyTypes 约束，已在编辑边界修正；最终定向 build → lint → typecheck → tsd → test 通过，39 文件 / 292 项，日志位于 `/var/folders/nc/lnt357c50gdcwqlvymm9jn040000gn/T/repoctl-round37-targeted-ht1hjuze`。

第三十七轮最终完整门禁：build 19/19、lint 17/17、typecheck 19/19、tsd 6/6；157 文件 / 1087 项和 2 文件 / 4 项开发场景测试全部通过。packaged-create（真实 tarball 生成工程的 build/lint/typecheck/tsd/test）、packaged-doctor（10 pass / 0 warn / 0 fail）、Worker 类型与冷构建/缓存/配置回归、workflow 合同、无追踪构建产物、2 个 change intent 与 diff 检查均通过。完整日志位于 `/var/folders/nc/lnt357c50gdcwqlvymm9jn040000gn/T/repoctl-round37-gates-e1s367te`。独立只读复核未发现本轮阻塞遗漏；双语 README、网站、公开 skill 与既有发布意图已同步，相关生产模块和新增测试均低于 300 行。验证环境为本机 macOS / Node v24.18.0；三平台 × Node 22/24 CI 保留，未触发远端 CI。改动保持隔离 worktree 的本地未提交状态，原 checkout 的 `templates/nimbus/` 未修改，goal 保持 active。

下一项进入 pre-push 提交验证设计：先把 hook 的每个非删除 ref 解析为实际 commit，保留不同远端 base 并按目标 commit 去重。验收要求非当前单 ref 与多个不同 ref 真正运行各自提交中的代码，普通分支及轻量/附注 tag、同 SHA 多 ref、删除 ref、嵌套 workspace 和显式目录参数保持正确。隔离执行需使用对应提交的 workspace 与依赖，防止借用当前 node_modules 的 workspace 链接读取错误代码；原 HEAD、index、tracked/untracked 内容必须保持不变，安装或验证失败也必须清理本次临时资源后再传递退出码。空 stdin 的现有本地验证语义保留。该项目前只有复现和设计证据，尚未实施或声称支持多提交验证。

## 第三十八轮：pre-push 验证实际推送的提交

主代理在当前构建产物上再次运行 `/tmp/repoctl-prepush-refs-probe.mjs`，证据保存在 `/tmp/repoctl-prepush-refs-tYAgFq/results.json`：非当前 broken 单 ref 和 main+broken 多 ref 均错误退出 0；检出 broken 后同一输入退出 9。此前仅合并 ref 的路径变化，再在当前磁盘发现 workspace 和执行脚本，无法说明推送提交通过验证。

| 优先级 | 工作项及问题依据 | 验收条件 | 状态 |
| --- | --- | --- | --- |
| P1 | Git diff 来自推送提交，实际任务却运行当前 checkout 的代码 | 严格解析每个 ref、剥离 tag 到 commit，按目标 commit 合并不同 base 的变化；非当前及多 ref 真正运行各自代码；同 SHA 仅验一次，删除/重命名/新远端/force push 保持 | 已复现，实施中 |
| P1 | 隔离目录借用当前依赖会通过 workspace 链接再次读取错误代码 | 独立本地 clone，使用提交内 workspace/manifest/lockfile；需要依赖或安装 lifecycle 时 frozen install；无依赖脚本直接运行；安装失败明确失败，原 HEAD/index/用户内容不变 | 设计完成，实施中 |
| P1 | 原执行器直接 process.exit，新增临时资源无法在失败或中断时清理 | 默认子进程受监督；失败及 SIGINT/SIGTERM 清理自身 clone 后保留退出语义；清理失败报告准确路径；空 stdin 和 delete-only 保留既有本地 lint/typecheck 语义 | 设计完成，实施中 |

## 默认边界

所有实现位于独立 worktree，保留原 checkout 的 `templates/nimbus/`。本目标交付本地可审查改动、测试结果与发布意图；不自动发布、合并或向外部发送消息。

第三十八轮最终门禁：pre-push 改为按推送输入中的非删除 ref 解析 peeled commit，并为每个唯一 commit 创建独立临时本地克隆。workspace、manifest、脚本和依赖均从目标提交读取；有依赖或安装生命周期时在克隆内执行 `pnpm install --frozen-lockfile`，无依赖时直接运行验证。Git 规划与克隆执行统一禁用本地 `refs/replace`，NUL name-status 保留删除、重命名两侧和含空格/中文路径；重复 commit 合并 refs 与不同 remote base 的变更后只验证一次。命令执行器拆为进程树模块：POSIX 只操作本次 detached PGID，Windows 中断时只对仍存活的根 PID 执行精确 `taskkill /PID /T /F`，清理失败保留快照路径并返回专用错误；继承的 Git/pnpm cwd 指针、源 checkout 的 `node_modules/.bin` 和 `NODE_PATH` 均清除。显式 workspaces 中未被顶层 patterns 覆盖的包按自身或最近嵌套 workspace 根执行 frozen 安装，防止 `pnpm run` 隐式安装。

本轮定向验收最终通过：monorepo build、改动范围 ESLint、monorepo typecheck、tsd、pre-push 全量定向测试；完整门禁通过 build、lint、typecheck、tsd、test（166 文件 / 1146 项，修正并发构建产物导入导致的消费者超时后全部通过）、packaged-create、packaged-doctor（10 pass / 0 warn / 0 fail）、Worker 类型、workflow、无追踪构建产物、`pnpm change check` 和 `git diff --check`。完整日志目录为 `/var/folders/nc/lnt357c50gdcwqlvymm9jn040000gn/T/repoctl-round38-gates-0agb94rk`，定向日志目录为 `/var/folders/nc/lnt357c50gdcwqlvymm9jn040000gn/T/repoctl-round38-targeted-wyy73odc`。实际推送提交 probe 证据为 `/tmp/repoctl-prepush-refs-8fwCSQ/results.json`：从 healthy checkout 推送 broken 单 ref 或 mixed refs 均退出 9 并运行提交内 BROKEN 脚本，检出 broken 控制组同样退出 9，原 Git status 保持不变；三组临时快照均清理。验证环境为 macOS / Node v24.18.0；三平台 × Node 22/24 CI 配置保留，未触发远端 CI。所有改动保持隔离 worktree 的本地未提交状态，原 checkout 的 `templates/nimbus/` 未修改，Goal 保持 active。

| 优先级 | 工作项及问题依据 | 验收条件 | 状态 |
| --- | --- | --- | --- |
| P1 | pre-push 读取当前 checkout 而非真实推送 commit | 每唯一 peeled commit 使用提交内 workspace/脚本/依赖；多 ref、tag、删除、force push、rename、NUL 路径覆盖；源工作树不变 | 已通过完整门禁 |
| P1 | 进程中断或失败可能遗留临时克隆及后代进程 | 失败/中断清理自有 clone 和进程树，无法确认安全清理时保留快照并报告路径 | 已通过完整门禁；setsid 脱离的 POSIX 后代及 Windows 根自然退出后的后代无法安全识别，保留为明确边界 |
| P1 | 显式 workspace 未被 manifest patterns 覆盖时跳过 frozen install | 外部显式包及嵌套 workspace 按最近根去重安装，缺 lockfile 明确 frozen 失败，不触发隐式安装 | 已通过定向与完整门禁 |

下一轮先审查 pre-push 的子模块来源和 clone 对象隔离：验证相对/绝对 submodule URL、缺失提交和认证失败是否在规划前可诊断，确保子模块失败也清理临时目录；随后再审查升级/创建真实消费者流程中是否存在同类环境指针污染。
