# Documentation workspace

This is a static Nimbus + Astro documentation site. Run commands in this workspace; install dependencies from the monorepo root after `corepack enable`.

- Content lives in `src/content/docs/`; English uses the root and Chinese uses `zh/` with matching relative filenames. Keep both translations and links in sync. The directory tree supplies routes and navigation.
- Layouts and components are project-owned. Keep modules small. Put styles in `src/styles/` so Stylelint checks every authored style.
- Register MDX components in `src/components.ts`. Add a text conversion in `astro.config.ts` when a custom component conveys information that would otherwise disappear from Markdown.
- Set the canonical `site` URL and project title in `astro.config.ts` before deployment. Static output is `dist/` and can be hosted anywhere.
- Run `pnpm build`, `pnpm lint`, and `pnpm typecheck`. `typecheck` combines Astro diagnostics with TypeScript checks. Search uses the production Pagefind index; verify it with `pnpm preview` after building.
- Verify `/llms.txt`, `/zh/llms.txt`, `/llms-full.txt`, and each page's `/index.md` and `/index.mdx`. Keep private content outside public content collections; `noindex` is not access control.
- `draft: true` excludes unfinished pages from production. When adding a page, create its translation before publishing so the language switch remains valid.
- Keep `nimbus.json` and `UPSTREAM.md` when upgrading. Review Nimbus migrations and project-owned changes before advancing the reviewed version.
