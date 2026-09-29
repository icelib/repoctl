# cf 替代 Wrangler 的评估与迁移

## 结论与边界

本次替换统一用户的 Cloudflare 命令入口，保留必要的底层实现依赖。cf 尚处于 beta，并不意味着依赖树中完全没有 Wrangler：Vue 模板使用 Vite 插件 v2，Hono 和 VitePress 由 cf 调用 Wrangler 的开发、构建委托入口。

固定版本：`cf@1.0.0-beta.5`、`@cloudflare/vite-plugin@2.0.0-beta.sha-ad79608dd`、`wrangler@4.136.3`。声明检查使用与 cf 一致的 `@cloudflare/config@0.20.0`、`@cloudflare/runtime-types@0.1.4`。相关 Renovate 更新统一分组且不自动合并。

cf 的配置加载器使用 Node.js 模块钩子，实际要求 Node.js 22.18+。源码工作区和 Cloudflare 模板提高最低版本；独立 repoctl CLI 的最低版本不变。

## 命令与配置边界

| 现有能力 | 迁移后的实现 |
| --- | --- |
| Worker 本地开发 | `cf dev` |
| 生产部署 | `cf deploy` |
| 上传预览版本 | `cf workers versions create` |
| 离线部署检查 | `cf deploy --dry-run` |
| Worker 类型生成 | `cf workers types` |
| 类型只读检查 | `pnpm cf-typegen:check` 调用官方 API，在内存中生成并比较 |
| 列出版本 | `cf workers versions list --worker <name>` |
| 回滚 | `cf workers deployments create` 将指定版本的流量比例设为 100%，不默认使用 `--force` |

Worker 名称、兼容日期、绑定、域名、预览 URL、资源运行行为和可观测性放在 `cloudflare.config.ts`。Hono 的开发端口、文档站的资源目录放在 `wrangler.config.ts`。Vue 的开发端口和 host 放在 Vite 配置中。原 Wrangler JSONC 文件移除，避免双配置漂移。

Vite 插件 v2 将部署包写入 `.cloudflare/output`，Turbo 必须缓存该目录及 `.cloudflare/types`，而不是只缓存旧的 `dist`。部署产物不进入 Git 或发布模板。

文档站部署脚本必须先执行 VitePress 构建：当前底层实现对纯静态站点不能依赖 `build.command` 自动刷新资产。VitePress 页面发现、LLM 文档插件和双语检查均排除 `.cloudflare`，避免部署后再次构建时将产物当作源文件。

Vue 的 API 匹配显式包含 `/api` 和 `/api/*`。新版资源路由只写后者会让精确 `/api` 请求返回 SPA HTML；HTTP 回归检查覆盖这一行为。

预览继续使用版本上传，不切换到独立的 Worker Previews 产品，也不改变生产流量。Hono 的 Node 开发、构建和运行脚本保留。

## 类型生成兼容

cf 当前没有 `workers types --check`。模板的检查脚本读取原配置，用官方 API 生成完整声明并比较，不写入、修复或恢复用户文件。检查时不信任现有运行时声明缓存，因此即使头部没有变化，声明正文被损坏也能发现。

声明写入 `.cloudflare/types/index.d.ts`。底层 Wrangler 开发器的旧类型生成已关闭，避免额外生成 `worker-configuration.d.ts`。绑定通过 TypeScript 从配置推导，修改绑定无需让声明文本发生变化；类型检查负责验证其使用。兼容日期、标志、运行时版本变化仍需要重新生成运行时声明。

后续升级 cf 时，需要同步核对声明 API、文件格式、输出位置及底层实现版本，运行全部回归检查。上游提供等价只读命令后可删除适配脚本。

## 验收方式

- 先 build，再 lint、TypeScript、tsd 和测试。
- `pnpm test:worker-types` 从打包模板创建项目，检查缺失/过期/损坏类型、只读检查、配置错误、绑定推导、缓存恢复及失效。
- 同一回归入口验证三个模板的冷部署 dry-run、部署配置、Vue 页面和 API、Hono Worker/Node、文档站 404/重定向，以及版本上传和回滚请求参数。
- `pnpm test:packaged-create` 验证发布包的创建流程；既有 CI 在 Linux/macOS/Windows、Node 22/24 上执行验证。
- 本 PR 不执行真实云端发布、回滚或生产流量调整；dry-run 不能验证账号权限和远端发布结果。完整结果见 PR 检查记录。

已有业务项目不会被自动改写。迁移步骤见模板参考文档的 Cloudflare Worker 类型章节。

## 上游依据

- [cf 源码与发布说明](https://github.com/cloudflare/cf)
- [类型只读检查缺口](https://github.com/cloudflare/cf/blob/main/usecases/types-ci-check.yaml)
- [开发委托版本约束](https://github.com/cloudflare/cf/blob/main/packages/cli/src/commands/dev/known-impls.ts)
- [版本上传与部署共用实现](https://github.com/cloudflare/cf/blob/main/packages/cli/src/commands/deploy/shared.ts)
