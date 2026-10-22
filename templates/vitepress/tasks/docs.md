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

## Install the managed workflows

Upgrade repoctl to a version containing this capability, then review and apply the managed asset update:

```bash
pnpm exec repo config validate
pnpm exec repo upgrade --dry-run --json
pnpm exec repo upgrade --yes
```

`repoctl-docs.yml` is added only when `commands.docs.sites` is configured. It sends `main` pushes to preview and provides a manual entrypoint. `repoctl-docs-deploy.yml` is an inert reusable workflow shared by preview, stable releases and retries. The managed Release workflow passes `release-record` and `docs-sites` outputs to it after stable finalization. Existing custom documentation workflows are preserved and need an explicit migration; check the upgrade plan rather than assuming they were replaced.

Disable the old `main` → production deployment and any hosting-provider Git integration that also publishes production. Keep one deployment owner per channel. The reusable workflow uses `docs-<site>-<channel>` environments and a matching concurrency group with cancellation disabled. Environment approvals follow the repository's existing settings; repoctl does not add an approval policy.

For Cloudflare deployments, provide `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` through the existing repository or environment secrets; the account ID may also be a variable. The core command is provider-independent. Other providers can supply credentials through a customized workflow while retaining its source selection, deployment commands and concurrency contract.

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

Preview the correction locally first:

```bash
repo docs plan guide --channel stable --commits <first-sha> <second-sha> --json
```

Every correction must be a single-parent commit already in `origin/main` history. Its complete patch must contain only configured documentation paths and supported content/static-asset extensions. Package manifests, lockfiles, workflows, scripts, release intents, agent instructions, executable files and symlinks are excluded. Review the text against the currently published behavior; path checks cannot establish whether a newly described feature exists in that version.

repoctl applies only those selected patches to the stable source. It does not copy a current directory from `main`. A conflict stops deployment. Existing corrections remain applied across retries; when a later stable source already contains a correction, it is no longer reapplied.

## Deployment script contract and recovery

repoctl invokes `pnpm install --frozen-lockfile`, the configured build script, then the selected deployment script in an isolated source checkout. Both scripts receive:

| Variable                               | Meaning                                                                    |
| -------------------------------------- | -------------------------------------------------------------------------- |
| `REPO_DOCS_SITE` / `REPO_DOCS_CHANNEL` | Selected site and `preview` or `stable`                                    |
| `REPO_DOCS_SOURCE_SHA`                 | Exact source commit                                                        |
| `REPO_DOCS_RELEASE_ID`                 | Stable completion record ID; empty for preview                             |
| `REPO_DOCS_DEPLOYMENT_ID`              | Deterministic deployment identity, including corrections                   |
| `REPO_DOCS_URL`                        | Optional configured target URL                                             |
| `REPO_DOCS_RESULT_FILE`                | File the deployment adapter must write after verifying the provider result |

The adapter must return a nonempty provider version ID and may return an HTTP(S) URL:

```json
{ "versionId": "provider-deployment-version", "url": "https://docs.example.com" }
```

Use `REPO_DOCS_DEPLOYMENT_ID` to reconcile an interrupted deployment before uploading again. Write the result file only after the provider confirms the outcome. A zero process exit without a valid result file is not a completed deployment.

The workflow runs `repo docs plan` followed by `repo docs deploy` with the same inputs. Stable deployment requires GitHub Actions, a run ID and `REPO_DOCS_CONCURRENCY_GROUP` matching the real serialized workflow group; use `plan` for local review. Revision-checked state is claimed before building or deploying, and the deployed pointer advances only after a verified provider result.

If a build fails, fix the cause and rerun the documentation workflow against the same release record. npm is not republished. If a stable runner disappears during deployment, rerun the same deployment so the adapter can reconcile its result; a different stable deployment cannot replace an unresolved `deploying` operation. For preview, the serialized managed workflow may replace an interrupted older deployment with the latest main source. Already completed deployments and unrelated release batches skip. Retain `repoctl-release-state`; short-lived Actions artifacts are diagnostic copies, not the deployment baseline.

An unfinished stable deployment saves its site configuration, release record, requested corrections and verified source tree. Retry with the same release and correction inputs. The planner rechecks those saved inputs and deployment identity, and the build uses the saved configuration even if `main` has changed or removed that site. Omitting `release` selects the current stable baseline; when the first deployment has no current baseline, it selects the pending release. If a newer release is pending while an older baseline is current, specify the newer release explicitly. Invalid or inconsistent saved state stops recovery before building or uploading.

A fix that changes product source or build scripts needs a new stable baseline; the same release record continues to build its original source.

The programmatic APIs are `planDocsDeployment(options)` and `deployDocs(options)`. `DocsOptions` accepts the site, channel, source/release/correction selection, optional config and environment, and a `DocsStateStore` implementing `readAutomationState`, `writeAutomationState` with revision checks, and `readBranchHead`. Query errors must fail closed.
