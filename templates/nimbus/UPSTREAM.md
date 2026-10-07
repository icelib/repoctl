# Upstream source

This template adapts the static empty starter from [Cloudflare Nimbus](https://github.com/cloudflare/nimbus), released under the MIT license (see `LICENSE`).

- Starter tag: `templates-v0.7.9`
- Starter commit: `aae348048a8c659f84c39696ee6b20c2ad2f5ae2`
- Nimbus package: `@cloudflare/nimbus-docs@0.16.0`
- Astro: `7.3.6`

Nimbus declares Astro `>=7.2.6 <8`; Astro requires Node `>=22.12.0`, so this workspace retains its stricter Node `>=22.13.0` baseline. Builds, Astro diagnostics and TypeScript checks were verified with the repository's TypeScript `6.0.3` and Vite `8.3.3` constraints. Resolved dependencies are recorded in the monorepo's root `pnpm-lock.yaml`; generated projects use their own root workspace lockfile.

Agent endpoint routes and the content-loading approach come from that starter. The bilingual layout, navigation, search interface, examples and workspace checks are repoctl adaptations. These files are maintained locally; generating a project never downloads the upstream starter.

The local head component emits page-specific language metadata because the upstream head uses the site-wide locale. Client scripts are emitted as external assets so Astro does not inline them before Vite finalizes Pagefind's dynamic import.

The package version and starter tag were checked against published package metadata. `nimbus.json` records the reviewed package API baseline. The original full starter was not copied wholesale, so upstream starter diffs are not a claim that every local file is an unmodified upstream component.
