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

Edit `src/content/docs/` and its `zh/` translations. Set your project title and canonical site URL in `astro.config.ts` before publishing `dist/` to a static host. Search is available after a production build.

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
