# Dev Container 预设

`repo tooling devcontainer` 为现有 pnpm 工作区预览可选开发容器。从子包运行也会定位到工作区根目录；预览和应用计划都不会启动 Docker 或安装依赖。

```bash
repo tooling devcontainer
repo tooling devcontainer --json --out ../devcontainer-plan.json
repo tooling devcontainer --apply ../devcontainer-plan.json
```

先审阅 JSON，再应用计划。预设在根 `.devcontainer` 下生成 `devcontainer.json`、`Dockerfile`、`setup.mjs` 和 `README.md`。已有自定义文件或根 `.devcontainer.json` 会阻止应用并保留原状。JSON 提供逐文件 hash 和 unified diff；完整应用过的计划再次执行不会写入。输入或目标变化后应重新预览。`--out` 只创建新计划文件，不覆盖已有文件。

默认依次从 `24.21.0`、`22.23.3` 中选择满足根 `engines.node` 的固定版本。可用 `--node-version <精确版本>` 指定其他满足声明范围、至少为 `22.13.0` 的稳定 Node 版本。启动 Docker 时对应 `node:<版本>-bookworm` 镜像必须存在；预览不会访问 registry。根 `packageManager` 必须固定稳定 pnpm 版本，可以包含 Corepack integrity hash。

生成配置后，通过 Dev Containers 扩展打开工作区，或主动运行 [Dev Containers CLI](https://github.com/devcontainers/cli)。创建容器会安装 Corepack `0.36.0`、启用 pnpm、检查其精确版本，并强制校验 engines 后安装工作区。存在 `pnpm-lock.yaml` 时使用 frozen lockfile；首次没有 lockfile 时创建它。Corepack 或安装失败会终止初始化。

容器和远程命令均使用非 root 的 `node` 用户，Dev Containers 可将 UID 调整为宿主用户。pnpm store 位于源码外的独立命名卷。宿主和容器平台不同时使用独立 checkout，避免跨平台共享已安装的 `node_modules`。按应用需要修改 `forwardPorts`，例如 `[3000, 5173]`；默认不转发端口。初始化完成后主动启动开发服务。

容器内依次运行生成项目的 `pnpm build`、`pnpm lint`、`pnpm typecheck`、`pnpm tsd`、`pnpm test` 和 `pnpm exec repo doctor`。已有容器文件由使用者维护；运行时要求变化后重新生成计划，可以审阅预设的差异。

程序化 API 为 `repoctl` 导出的 `planDevContainer(cwd, { nodeVersion? })` 和 `applyDevContainerPlan(cwd, plan)`。应用使用公共文件事务，核对输入并按文件所有权恢复失败写入。容器预设独立于 `repo init` 的默认预设。

进程中断后检查 `.repoctl/devcontainer.lock` 与 `.devcontainer` 下的 `.repoctl-upgrade-*.tmp`。先确认没有活跃写入进程，保留并发编辑并核对部分写入的文件，再移除残留锁并重新预览。普通失败仅删除本次应用拥有的文件和空目录。

参考：[Dev Containers 配置规范](https://containers.dev/implementors/json_reference/)和[官方 Node/TypeScript 模板](https://github.com/devcontainers/templates/tree/main/src/typescript-node)。
