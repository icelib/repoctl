# 准备构建上下文与生产产物

`repo workspace prepare` 预览一个明确的工作区包。`prune` 调用本地 Turbo 2，生成部分 monorepo 与裁剪后的锁文件；`deploy` 调用根 `packageManager` 锁定的 pnpm，生成生产目录。命令只准备本地文件，不运行应用、不构建镜像，也不连接部署平台。

```sh
# 先显式构建所需产物。
pnpm build
repo workspace prepare @acme/service --mode prune --out ../service-build --json > ../prune-plan.json
repo workspace prepare --apply ../prune-plan.json

# 保留 Turbo 原生的 Docker full/json 缓存层。
repo workspace prepare ./apps/service --mode prune --docker --out ../docker-context --json

# 只使用本地存储，生成包含生产 workspace 依赖的目录。
repo workspace prepare @acme/service --mode deploy --entry dist/server.js --offline --out ../service-runtime --json > ../deploy-plan.json
repo workspace prepare --apply ../deploy-plan.json
```

预览始终只读，`--dry-run` 用于明确默认行为。原生版本、能力与路径设置探测不会安装工具。JSON 计划必须保存在源工作区外，审查后另行 `--apply`；应用不能混用目标、预览选项或 `--dry-run`。

## 原生行为与前置条件

两种模式都要求已有 pnpm 工作区和 `pnpm-lock.yaml`。使用准确包名或 `./目录` 选择唯一、具名的非根包，不支持 glob、多包匹配或依赖选择表达式。输出必须位于源工作区之外，父目录必须已存在；链接目标、重叠目录和无关的非空目录会被拒绝，没有强制覆盖选项。

Prune 支持本地已安装的稳定 Turbo 2，保留原生构建依赖选择规则。`manifestCandidates` 仅解释清单关系，实际保留哪些包由 Turbo 决定。任务依赖、global 文件是否纳入，遵从对应版本和配置。`--docker` 保留原生 `full`、`json` 与锁文件布局。

Deploy 支持明确锁定的稳定 pnpm 10、11、12，且原生命令必须提供所需选项。执行使用 `--prod`、`--ignore-scripts`、`--frozen-lockfile`，并禁用 pnpmfile hooks。`--legacy` 显式选择原生旧模式；该模式的生产目录可能没有根锁文件，只有 prune 要求产物包含该文件。pnpm 12.2 起支持非注入的 workspace 依赖；更早版本可能需要 `injectWorkspacePackages` 或 legacy 模式。peer 歧义和其他原生错误保留诊断代码并导致失败，repoctl 不自行解析或重写依赖图、锁文件。

部署前会验证已构建的运行入口：显式 `--entry`、`package.main` 或唯一 `bin`。如果原生 `files`/ignore 规则未包含入口，准备失败。不会解释或执行任意 `start` 脚本。依赖生命周期脚本保持关闭；需要的原生二进制应事先准备。准备产物不等于验证应用全部运行行为。

## 源目录与产物边界

原生工具运行在隔离的源码副本中，不复制源 `node_modules`、`.git`、`.turbo` 和 `.repoctl` 存储。复制前排除真实 `.env`/`.env.*`、`.npmrc`、`.netrc`、`_netrc`、Yarn 认证配置及 `.aws`、`.ssh`、`.gnupg` 路径，保留公开的 `.env.example`、`.env.sample`。产物再次检查这些路径。这是明确文件名规则，不是通用秘密检测器；示例文件应使用公开占位值，部署凭据另行提供。

源码副本保留被 Git 忽略的构建文件，最终是否纳入仍由原生 prune/打包规则决定。源码链接和特殊文件会被拒绝。输入和输出清单限制为 100,000 项、1 GiB；需要其他复制或存储策略的工作区可直接使用原生命令。

命令读取 pnpm 有效 store/cache/state/module/lockfile 路径，不输出含凭据的完整配置。会写回源工作区的配置在 deploy 前被拒绝，module/lockfile 存储必须保持产物内的相对路径。暂存目录也必须在源工作区之外；工作区外的原生全局存储仍由 pnpm 管理。

产物链接只能指向产物内部。相对链接保留；Windows 目录 junction 会针对最终产物目录重新创建。传输 Windows 产物时，使用会复制 junction 内容的复制/归档方式。集成验收会复制目录、移除源码和原产物，再独立执行生产入口。

## 审查、恢复与重复应用

计划包含源文件、权限、工具/版本、相关路径设置与选项的指纹。应用重新生成计划并拒绝漂移，在复制后、原生执行后、发布中及完成前复核源输入，并保留并发编辑。

原生产物先进入暂存目录。发布以独占方式创建文件，记录归属和已写内容，最后提交 `.repoctl-artifact.json`。提交前文件可能已经可见，不应消费不完整目录。失败只移除本操作写入且未被修改的内容，保留并发文件并报告准确路径。成功后仅清理失败时，通过 `cleanupPending` 报告，不谎报回滚。

重复应用只有在完整 receipt 与文件清单仍匹配时才返回 `unchanged`。未知或修改过的非空目录从不覆盖。`.repoctl/workspace-artifacts.lock` 覆盖重复检查、原生执行、发布与清理。进程中断后，先确认没有活动写入进程，检查并恢复不完整产物与保留暂存路径，再移除锁。

公共 API：`planWorkspaceArtifact(cwd, options)`、`applyWorkspaceArtifactPlan(cwd, plan, { signal, timeoutMs })`；JSON schema 为 1。原生执行默认两分钟超时，API 可配置至十分钟。

参考：[Turbo prune](https://turborepo.com/docs/reference/prune)、[pnpm deploy](https://pnpm.io/cli/deploy)。
