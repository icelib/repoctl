# 2026-11-16 Dependency Refresh

This refresh starts from `origin/main` and applies the stable patch and minor
updates available on 2026-11-16. The workspace now uses pnpm 12.21.0, with the
snapshot workflow defaults and published template metadata kept in sync.

## Updated stable dependencies

- ESLint tooling: `@eslint-react/eslint-plugin` 5.30.3, `@weapp-vite/eslint`
  0.3.4, `eslint` 10.15.0, `eslint-plugin-react-refresh` 0.5.8 and
  `eslint-plugin-mdx` 3.10.1.
- Client and template tooling: tRPC 11.28.3, Astro 7.4.12, Vue I18n 11.4.20,
  Vue Router 5.5.1, Vue Test Utils 2.6.0 and Wrangler 4.162.0.
- Shared tooling: Playwright 1.65.1, PostCSS 8.5.33, `postcss-html` 2.0.1.

The source templates are authoritative; generated assets were refreshed with
`@icebreakers/monorepo-templates sync:assets`. The lockfile was regenerated
with pnpm 12.21.0.

## Compatibility decisions

The major and prerelease candidates remain unchanged: `@stylistic/eslint-plugin`
5.x, `node-diff3` 3.x, `c12` 3.x, and the TypeScript 6.x toolchains used by
Volar/Astro/Vue templates. The root, React and Next workspaces continue to use
TypeScript 7.x. Historical examples and compatibility fixtures retain their
older versions.

Security and dependency reports are part of the release validation for this
refresh. Existing peer diagnostics are reported separately from failures.
