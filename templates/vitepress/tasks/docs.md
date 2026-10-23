# Publish documentation with stable releases

Keep merged documentation available on a preview site while the production site describes published packages. This workflow supports `main` and the npm `latest` channel. Maintenance branches and prereleases do not advance production documentation.

## Configure a site

Add an explicit site to `repoctl.config.ts`:

```ts
import { defineMonorepoConfig } from 'repoctl'

export default defineMonorepoConfig({
  commands: {
    docs: {
      sites: {
        guide: {
          packages: ['@example/core'],
          buildScript: 'docs:build',
          preview: {
            deployScript: 'docs:deploy:preview',
            url: 'https://next.example.com',
          },
          stable: {
            deployScript: 'docs:deploy:stable',
            url: 'https://docs.example.com',
          },
          patchPaths: ['website/docs/**', 'website/static/img/**'],
        },
      },
    },
  },
})
```

Site IDs use lowercase letters, digits and hyphens. `packages` identifies published workspace products; workspace dependencies, optional dependencies and peer dependencies are included automatically. Script names refer to the root `package.json`. Use separate production and preview targets, and make the preview build visibly identify unpublished documentation and prevent search indexing.

The default publication check compares each covered package directory with its published Git source, excluding README, CHANGELOG, docs and test files. The package manifest is always checked. If builds read shared inputs outside package directories, configure repository-relative `releaseInputs` for each affected package:

```ts
const releaseInputs = {
  '@example/core': [
    'packages/core/**',
    '!packages/core/test/**',
    '!packages/core/CHANGELOG.md',
    'scripts/build/**',
    'tsconfig.base.json',
  ],
}
```

An explicit input list replaces that package's defaults. Covered packages must have publication evidence, matching versions and source ancestry, no unconsumed release intent, and no changed release inputs. Missing evidence blocks that site's deployment. Unrelated packages do not have to publish merely to update this site.

## Use the built-in Cloudflare Workers provider

For an assets-only Worker, replace the site's `preview` and `stable` script targets with native targets:

```ts
const cloudflare = {
  provider: 'cloudflare-workers' as const,
  config: 'website/wrangler.jsonc',
  accountId: '0123456789abcdef0123456789abcdef',
}

const targets = {
  preview: {
    ...cloudflare,
    workerName: 'docs-site-preview',
    environment: 'preview',
    url: 'https://next.example.com',
  },
  stable: {
    ...cloudflare,
    workerName: 'docs-site',
    url: 'https://docs.example.com',
  },
}
```

Keep `buildScript`, `packages`, `releaseInputs` and `patchPaths` on the site as before. A target chooses either `deployScript` or `provider: 'cloudflare-workers'`; combining them is invalid. Existing script targets require no new discriminator or defaults, and remain supported for other providers and custom Cloudflare deployments.

Use a committed, repository-relative JSON or JSONC Wrangler configuration, for example `website/wrangler.jsonc`:

```jsonc
{
  "name": "docs-site",
  "account_id": "0123456789abcdef0123456789abcdef",
  "compatibility_date": "2026-10-01",
  "workers_dev": false,
  "preview_urls": false,
  "assets": { "directory": "dist" },
  "routes": [{ "pattern": "docs.example.com", "custom_domain": true }],
  "env": {
    "preview": {
      "name": "docs-site-preview",
      "routes": [{ "pattern": "next.example.com", "custom_domain": true }]
    }
  }
}
```

`workerName` and `accountId` assert the resolved deployment identity; they do not silently rewrite Wrangler configuration. Omit `environment` for the top-level configuration. A named environment must exist; its explicit `name` wins, otherwise Wrangler appends the environment name to the top-level Worker name. An environment's `assets` object replaces the whole top-level object, so a partial override must still include `directory`. Output paths are relative to the Wrangler file and must remain within the frozen checkout, including through symlinks.

Named environments must explicitly configure their own routes when the top level has routes. Preview and stable cannot share a physical Worker in the same account, even with different environment names, or claim each other's custom domains. A configured `url` must agree with the selected target. The example uses custom-domain routes; ambiguous routing is rejected.

The native provider accepts a deliberately limited static configuration: JSON/JSONC, assets-only Workers and supported custom-domain routing. TOML, generated or plugin-selected configuration, Worker code (`main`), custom build commands, bindings, service environments, provisioning and unsupported options require a `deployScript` adapter. Install Wrangler as a development dependency in the relevant workspace and commit its lockfile; repoctl uses the installed CLI without downloading one at deployment time.

During `deploy`, native preflight runs against the frozen configuration before that checkout's dependency installation and build. It checks credentials, account/Worker/configuration identity, paths and read-only Cloudflare deployment/version responses. Supply `CLOUDFLARE_API_TOKEN` at runtime. The nonsecret `accountId` is frozen in the site target; any `CLOUDFLARE_ACCOUNT_ID` environment value or effective Wrangler `account_id` must match it. A successful read proves access to the queried resource, not permission for a future upload or domain update: the token still needs the write permissions required by the chosen Worker and domains. Tokens are never part of the saved deployment identity.

Only an explicit Worker-missing response, HTTP 404 with Cloudflare error code `10007`, permits a first upload. Authentication errors, generic 404s, rate limits, malformed responses and empty deployment lists stop deployment. `repo docs plan` remains a source/publication inspection; it does not perform this credential preflight or certify provider access.

After the build, repoctl rechecks configuration and output containment, then writes `/.well-known/repoctl-deployment.json` into the assets output with the site, channel, deployment ID, source/tree SHAs and optional release ID. Existing content at that path must be a valid manifest for the same full identity; conflicting manifests or unrelated user files are preserved by failing the deployment. Cloudflare confirmation requires the latest active deployment to serve exactly one version at 100% and carry `repoctl-docs:<deploymentId>`. It verifies provider state; it does not poll the public site or prove that DNS and HTTP delivery are ready.

## Install the managed workflows

Upgrade repoctl to a version containing this capability, then review and apply the managed asset update:

```bash
pnpm exec repo config validate
pnpm exec repo upgrade --dry-run --json
pnpm exec repo upgrade --yes
```

`repoctl-docs.yml` is added only when `commands.docs.sites` is configured. It sends `main` pushes to preview and provides a manual entrypoint. `repoctl-docs-deploy.yml` is an inert reusable workflow shared by preview, stable releases and retries. The managed Release workflow passes `release-record` and `docs-sites` outputs to it after stable finalization. Existing custom documentation workflows are preserved and need an explicit migration; check the upgrade plan rather than assuming they were replaced.

Disable the old `main` → production deployment and any hosting-provider Git integration that also publishes production. Keep one deployment owner per channel. The reusable workflow uses `docs-<site>-<channel>` environments and a matching concurrency group with cancellation disabled. Environment approvals follow the repository's existing settings; repoctl does not add an approval policy.

For Cloudflare deployments, provide `CLOUDFLARE_API_TOKEN` through existing repository or environment secrets. The managed workflow also passes `CLOUDFLARE_ACCOUNT_ID` from a secret or variable; for native targets it must match the configured `accountId`. Other providers use deployment scripts and can supply credentials through a customized workflow while retaining its source selection, deployment commands and concurrency contract.

## Stable publication and the first baseline

Production starts from a durable completion record written after npm version/dist-tag confirmation, Git tags, GitHub Release metadata and required release hooks finish. A successful preparation run or newly created Release PR is insufficient. Records contain exact package versions and their original source commits; they are saved on `repoctl-release-state`, alongside independent per-site deployment pointers.

Package-only recovery does not create a stable documentation baseline. Complete or retry the full original release cohort before advancing production documentation.

The Release run's `repoctl-ci-progress.json` includes `releaseRecord` for manual deployment or retry. A deployment plan also reports its `releaseId`; corrections to an existing stable site can omit it.

The first production deployment waits for the next complete stable release after enabling this configuration. It cannot import arbitrary current `main` content as an initial baseline. Keep the existing production deployment serving until that release passes the documentation gate.

Each deployment installs the frozen lockfile and builds the complete original source checkout. Later `main` commits do not enter the stable build. Preview uses an exact `main` SHA and rechecks the remote branch before deploying. An older source cannot replace a newer deployed source.

Inspect either channel without installing dependencies, building or deploying:

```bash
repo docs plan guide --channel preview --source-sha <full-main-commit-sha> --json
repo docs plan guide --channel stable --release <completion-record-id> --json
```

The plan uses `schemaVersion: 1` and reports the source, package versions, selected corrections, deployment identity, `eligible`, `skipped` and `blockers`. An ineligible plan exits with code 1. Read-only GitHub access is needed to inspect saved records. Keep complete local Git history and a current `origin/main` reference.

## Correct published documentation independently

Merge a dedicated documentation correction into `main`, then choose its full commit SHA in the Documentation workflow's `commits` input. Select the site and `stable` channel. Omit `release` to correct the current stable site, or supply its completion record explicitly. Multiple commits use a space-separated list in the intended order.

A release that publishes none of the site's covered packages cannot become a correction baseline: selecting corrections with that record blocks deployment. Omit `release` to apply the selected patches to the current stable baseline. A related new stable release can still carry existing corrections and apply newly selected ones.

Preview the correction locally first:

```bash
repo docs plan guide --channel stable --commits <first-sha> <second-sha> --json
```

Every correction must be a single-parent commit already in `origin/main` history. Its complete patch must contain only configured documentation paths and supported content/static-asset extensions. Package manifests, lockfiles, workflows, scripts, release intents, agent instructions, executable files and symlinks are excluded. Review the text against the currently published behavior; path checks cannot establish whether a newly described feature exists in that version.

repoctl applies only those selected patches to the stable source. It does not copy a current directory from `main`. A conflict stops deployment. Existing corrections remain applied across retries; when a later stable source already contains a correction, it is no longer reapplied.

## Deployment adapters and recovery

repoctl invokes `pnpm install --frozen-lockfile` and the configured build script in an isolated source checkout, then calls the selected native provider or deployment script. Native targets perform the preflight described above first. The build and any deployment script receive:

| Variable                               | Meaning                                                              |
| -------------------------------------- | -------------------------------------------------------------------- |
| `REPO_DOCS_SITE` / `REPO_DOCS_CHANNEL` | Selected site and `preview` or `stable`                              |
| `REPO_DOCS_SOURCE_SHA`                 | Exact source commit                                                  |
| `REPO_DOCS_RELEASE_ID`                 | Stable completion record ID; empty for preview                       |
| `REPO_DOCS_DEPLOYMENT_ID`              | Deterministic deployment identity, including corrections             |
| `REPO_DOCS_URL`                        | Optional configured target URL                                       |
| `REPO_DOCS_RESULT_FILE`                | File a script adapter must write after verifying the provider result |

A script adapter must write a nonempty provider version ID and may return an HTTP(S) URL. The native provider returns this result directly; no deployment script or result-file writer is needed:

```json
{ "versionId": "provider-deployment-version", "url": "https://docs.example.com" }
```

Use `REPO_DOCS_DEPLOYMENT_ID` to reconcile an interrupted deployment before uploading again. Write the result file only after the provider confirms the outcome. A zero process exit without a valid result file is not a completed deployment.

The native Cloudflare provider performs this reconciliation itself. An active version with the same annotation and 100% of traffic is reused without another upload; a historical matching version is insufficient, and mixed traffic fails. A valid active version belonging to another deployment permits the new authorized upload. Wrangler's reported Worker, environment and version must match the target, and the reported version must be confirmed active before the current pointer advances.

The workflow runs `repo docs plan` followed by `repo docs deploy` with the same inputs. Stable deployment requires GitHub Actions, a run ID and `REPO_DOCS_CONCURRENCY_GROUP` matching the real serialized workflow group; use `plan` for local review. Revision-checked state is claimed before building or deploying, and the deployed pointer advances only after a verified provider result.

If a build fails, fix the cause and rerun the documentation workflow against the same release record. npm is not republished. If a stable runner disappears during deployment, rerun the same deployment so the adapter can reconcile its result; a different stable deployment cannot replace an unresolved `deploying` operation. For preview, the serialized managed workflow may replace an interrupted older deployment with the latest main source. Already completed deployments and unrelated release batches skip. Retain `repoctl-release-state`; short-lived Actions artifacts are diagnostic copies, not the deployment baseline.

An unfinished stable deployment saves its site configuration, release record, requested corrections and verified source tree. Retry with the same release and correction inputs. The planner rechecks those saved inputs and deployment identity, and the build uses the saved configuration even if `main` has changed or removed that site. Omitting `release` selects the current stable baseline; when the first deployment has no current baseline, it selects the pending release. If a newer release is pending while an older baseline is current, specify the newer release explicitly. Invalid or inconsistent saved state stops recovery before building or uploading.

If an upload succeeds but its response, verification or final checkpoint write fails, the `deploying` claim remains. A retry still installs and rebuilds the same frozen source, then checks the active remote version before deciding to upload. A failed preflight or rebuild during that retry must not erase the unknown upload outcome. Old pending script deployments continue to use their saved script target and original source after the live configuration switches to the native provider; migrate future deployments without rewriting historical snapshots.

A fix that changes product source or build scripts needs a new stable baseline; the same release record continues to build its original source.

The programmatic APIs are `planDocsDeployment(options)` and `deployDocs(options)`. `DocsOptions` accepts the site, channel, source/release/correction selection, optional config and environment, and a `DocsStateStore` implementing `readAutomationState`, `writeAutomationState` with revision checks, and `readBranchHead`. Optional `fetch` supplies the native provider's HTTP transport; `spawn` supplies the process transport. Query errors must fail closed. Public target types are `DocsScriptDeploymentTarget`, `DocsCloudflareWorkersTarget` and their union `DocsDeploymentTarget`.

## Build channel context

Nimbus and VitePress use the lightweight `repoctl/docs-context` entrypoint. Configure distinct preview and stable origins in the site's deployment module (`src/lib/deployment.ts` for Nimbus, `.vitepress/deployment/index.ts` for VitePress). Read only public build inputs at the framework boundary:

```ts
import { resolveDocsContext } from 'repoctl/docs-context'

const context = resolveDocsContext({
  channel: process.env.REPO_DOCS_CHANNEL,
  url: process.env.REPO_DOCS_URL,
  previewOrigin: 'https://next.example.com',
  stableOrigin: 'https://docs.example.com',
})
```

Undefined or empty channel selects `preview`; unknown channels fail. Origins must be distinct HTTP(S) origins without credentials, paths, queries or fragments; a trailing root slash is normalized. Set a framework `base` separately for subpath hosting. If `REPO_DOCS_URL` is nonempty, it must match the configured channel origin. The helper never reads credentials, GitHub state or release records. Both local builds work without deployment authorization:

```sh
REPO_DOCS_CHANNEL=preview pnpm build
REPO_DOCS_CHANNEL=stable pnpm build
```

`resolveDocsContext(options)` returns `DocsContext` (`channel`, `preview`, `origin`, `stableOrigin`); `DocsChannel` and `DocsContextOptions` are also exported. `docsPreviewRobots`, `docsRobots(context, sitemapUrl?)` and `mergeDocsHeaders(existing, context)` provide shared crawler policy. The default stable sitemap is `<origin>/sitemap.xml`; Nimbus passes its own `sitemap-index.xml` URL. The core package provides the same pure API at `@icebreakers/monorepo/docs-context`, without loading the CLI, filesystem or deployment providers.

The preview origin drives canonical, hreflang, social/structured URLs and Nimbus Markdown, LLM and discovery exports. Preview shows an unpublished notice linking to stable, emits `noindex, nofollow, noarchive`, disallows crawlers in robots.txt and adds an equivalent marked X-Robots-Tag rule. Local search stays indexed. A page's authored `noindex` remains effective on stable; Nimbus honors an explicit `searchable: true` independently. Crawler directives are not access control.

`mergeDocsHeaders` preserves user and Nimbus rules, inserts marked preview fields into an existing wildcard rule where possible, and removes only its own fields on stable. Malformed ownership markers fail the build. Nimbus runs this merge after its discovery integration; VitePress uses its buildEnd hook. Framework output cleanup removes stale preview/stable artifacts on repeated builds.

The templates declare `REPO_DOCS_CHANNEL` and `REPO_DOCS_URL` in task-local Turbo `env` for build, lint, typecheck and test. Their authored Markdown, framework configuration and validation scripts participate in cache inputs. Keep these values hashed, not passthrough-only; verify with `repo env check build lint typecheck test --json`. Declare `repoctl` in the docs workspace's devDependencies so the helper is available in a frozen build. Existing customized layouts are preserved: adopt these pieces manually or through a reviewed `repo templates upgrade` plan, rather than assuming a root `repo upgrade` rewrites them.
