# Upstream source

This template adapts the static empty starter from [Cloudflare Nimbus](https://github.com/cloudflare/nimbus), released under the MIT license (see `LICENSE`).

- Starter tag: `templates-v0.7.9`
- Starter commit: `aae348048a8c659f84c39696ee6b20c2ad2f5ae2`
- Nimbus package: `@cloudflare/nimbus-docs@0.17.0`
- Nimbus release commit: `1951de5cc3e420a5e672f192c334584216716c1e`
- Astro: `7.4.0`

Nimbus declares Astro `>=7.2.6 <8`; Astro `7.4.0` requires Node `>=22.22.0`. This workspace applies the stricter security baseline `^22.23.4 || ^24.22.1 || >=26.12.1` and recommends Node.js 24.22.1 LTS. The repository validates builds, Astro diagnostics and TypeScript checks with TypeScript `6.0.3` and Vite `8.3.4`. Resolved dependencies are recorded in the monorepo's root `pnpm-lock.yaml`; generated projects use their own root workspace lockfile.

Agent endpoint routes and the content-loading approach come from that starter. The bilingual layout, navigation, search interface, examples and workspace checks are repoctl adaptations. These files are maintained locally; generating a project never downloads the upstream starter.

The local head component emits page-specific language metadata because the upstream head uses the site-wide locale. Client scripts are emitted as external assets so Astro does not inline them before Vite finalizes Pagefind's dynamic import.

The package version and starter tag were checked against published package metadata. `nimbus.json` records the reviewed package API baseline. The original full starter was not copied wholesale, so upstream starter diffs are not a claim that every local file is an unmodified upstream component.

## Nimbus 0.17.0 upgrade review

The `0.16.0` → `0.17.0` review follows the installed package's `nimbus-docs migrate --dry-run --json` report and the release's [upgrade manifest](https://github.com/cloudflare/nimbus/blob/1951de5cc3e420a5e672f192c334584216716c1e/packages/nimbus-docs/src/_internal/upgrade-manifest.json).

| Required review | Template decision |
| --- | --- |
| `api-body-request-example` | No API collection or copied `ApiBody` component exists. No component replacement is needed. |
| `api-catalog-published-specs` | No API collection or versioned spec exists, so there are no specs to publish or hide. |
| `api-version-id-format` | No API versions are configured. |
| `version-switcher-keeps-query` | No query-versioned API or copied `VersionSwitcher` exists. |
| `page-collections-from-helpers` | The only collection uses `defineCollection(docsCollection())`; there are no plain-loader page collections or rendering overrides. |
| `generated-agent-discovery-routes` | Neither `public/` nor `src/pages/` owns the generated discovery paths. Nimbus generates both discovery documents and homepage Link headers; packaged regression checks validate their resources and static header rules. |

The site remains static. Its existing Markdown/MDX and LLM endpoint factories stay valid. Optional copied-sidebar, browser WebMCP and server-rendering changes are not adopted. There is no project `skills/` directory to publish. Existing `robots.txt` policy is preserved; the new starter's optional AI training Content Signals are not adopted implicitly.

For a subpath deployment, publish the generated `.well-known/` directory at the origin root and apply its header rules there. Hosts that do not consume `_headers` need equivalent native header configuration; see the [agent deployment guidance](https://nimbus-docs.com/ai/docs-for-agents/).
