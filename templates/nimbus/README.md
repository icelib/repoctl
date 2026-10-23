# Project docs / 项目文档

A small bilingual Nimbus + Astro documentation site. 英文位于 `/`，中文位于 `/zh/`。

From the monorepo root, run `corepack enable` and `pnpm install`. Then run these commands in this directory:

```sh
pnpm dev
pnpm build
pnpm preview
pnpm lint
pnpm typecheck
```

Edit `src/content/docs/` and its `zh/` translations. Set your project title in `astro.config.ts` and channel origins in `src/lib/deployment.ts` before publishing `dist/` to a static host. Search is available after a production build.

机器可读入口包括 `/llms.txt`、`/zh/llms.txt`、`/llms-full.txt`，以及页面的 `/index.md` 和 `/index.mdx`。Nimbus 还会生成 `/.well-known/ard.json`、`/.well-known/ai-catalog.json` 和 `dist/_headers` 中的发现响应头。静态托管需要应用这些响应头；不支持 `_headers` 的主机应配置等效规则。使用子路径部署时，发现文件仍须发布到域名根目录的 `/.well-known/`，并在那里应用对应响应头规则。详见 `AGENTS.md` 和 `UPSTREAM.md`。

## Upgrading Nimbus / 升级 Nimbus

Nimbus updates can require review even within a minor release. Keep its dependency pinned to an exact version and review the migration report before advancing `nimbus.json`.

更新依赖后，先在 monorepo 根目录运行 `pnpm install --ignore-scripts`，再在此目录检查迁移要求：

```sh
pnpm exec nimbus-docs migrate --dry-run --json
```

逐项核对适用条件并完成必要修改，在 `UPSTREAM.md` 记录审阅结论，再通过官方命令记录基线并验证：

```sh
pnpm exec nimbus-docs migrate --yes
pnpm exec nimbus-docs check --migrations
pnpm build
pnpm lint
pnpm typecheck
```

不要只修改审阅版本来跳过迁移。部署前检查发现文件、首页 Link 响应头，以及中英文页面和机器可读入口。

## Preview and stable builds / 预览与正式构建

Set distinct `previewOrigin` and `stableOrigin` in `src/lib/deployment.ts`; `astro.config.ts` consumes the same public context as page metadata, robots and the official Nimbus AI/discovery endpoints. With no channel configured, local builds use preview. Both commands work without deployment credentials:

```sh
REPO_DOCS_CHANNEL=preview pnpm build
REPO_DOCS_CHANNEL=stable pnpm build
```

`REPO_DOCS_URL`, when nonempty, must match the selected origin. Configure a subpath with Astro `base`, not an origin pathname. The build rejects a hosting environment that changes Nimbus's resolved origin. The template's Turbo tasks hash both channel inputs and all authored content/configuration/scripts.

预览站显示未发布提示，输出 robots、meta 和 X-Robots-Tag 禁止搜索引擎收录策略，同时保留 Pagefind 站内搜索、Markdown 和 LLM 导出。内容自身的 `noindex` 与搜索资格分开处理，显式 `searchable: true` 仍可搜索。正式构建移除渠道专属限制，保留内容的 `noindex`。`_headers` 只增删 repoctl 标记的部分，保留用户缓存/安全策略和 Nimbus 发现响应头；标记损坏会直接失败。禁止收录不是访问控制。
