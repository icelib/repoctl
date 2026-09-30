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

机器可读入口包括 `/llms.txt`、`/zh/llms.txt`、`/llms-full.txt`，以及页面的 `/index.md` 和 `/index.mdx`。详见 `AGENTS.md` 和 `UPSTREAM.md`。
