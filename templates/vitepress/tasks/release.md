# Release packages

Use this task when a change is ready to version and publish. Keep the release plan reviewable before any registry write.

To keep production documentation aligned with published packages while main updates a preview site, configure [documentation publication](/tasks/docs).

## Prerequisites

- `repo doctor` reports a valid package manager and release configuration.
- The working tree is clean except for the intended changes.
- Every publishable change has a changeset or the repository's chosen intent file.

## Smallest command

```bash
repo release plan --markdown
```

Review current and planned versions, direct intents, native dependency/fixed-group reasons, lanes, private packages, publish candidates, and release-note previews. Use `repo release plan --json` for the versioned machine interface (`schemaVersion: 1`); status is `ready`, `empty`, or `blocked`. Blocked plans exit with code 1 and stable blocker IDs.

The plan delegates version decisions to pnpm recursive dry-run (tested with pnpm 12.8.1). It never consumes intents, changes manifests/changelogs/ledger/Git state, installs or activates pnpm, runs version/release/pnpmfile hooks, or writes to registries. Install a supported pnpm version explicitly if it is unavailable. Hooks that would change preparation inputs are intentionally excluded; rerun the plan after making those changes explicitly.

After review, use the separate preparation entry `repo release ci --mode=prepare`. Preview already prepared publication or recovery with `repo release ci --mode=publish --dry-run`. A version plan describes pending intents and does not check registry authentication or prove that publishing can succeed.

## Expected result

The plan also validates internal dependencies of public packages: `dependencies`, `devDependencies`, and `optionalDependencies` must use `workspace:*`; `peerDependencies` may use `workspace:*`, `workspace:^`, or `workspace:~`. For a target at `2.0.1`, pnpm pack produces peer ranges of `2.0.1`, `^2.0.1`, and `~2.0.1`, respectively. Choose the declaration that expresses your compatibility contract; replacing a caret or tilde peer with an exact version changes that contract. External ranges and private consumers are outside this publishing protocol policy. Invalid protocols produce a `blocked` plan without rewriting manifests or running release hooks.

JSON and Markdown describe the same native version decisions. Notes use the existing release renderer and exclude already consumed intent entries. Private packages may change version but are marked as non-publish candidates. The public `createReleasePlan({ cwd })` API returns the same report without writing it to disk.

Planning, automatic triggers, and version preparation recognize the same root and private-package intents. Native pnpm controls version propagation across the complete workspace. Release PR notes include only publishable child packages and require their version-specific changelogs; missing root/private changelogs do not block preparation. Root packages are not publication candidates, even when they are not marked private. Configure pnpm's `versioning.ignore` when a workspace package should not participate in versioning, rather than changing workspace discovery only for the apply step.

## Stable and maintenance branches

Configure `commands.release.branches` in `repoctl.config.*`:

```ts
export default {
  commands: {
    release: {
      branches: {
        stable: 'master',
        maintenance: [{ branch: '1.x', range: '1.x', tag: 'legacy-1' }],
        prerelease: [
          { branch: 'preview/1.x', lane: 'beta', tag: 'legacy-beta', target: '1.x' },
        ],
      },
    },
  },
}
```

Omitting this configuration preserves `main` plus `alpha`, `beta`, `rc`, and `next`. `stable` defaults to `main`; omitting `prerelease` keeps those four lanes targeting the stable branch, while `prerelease: []` disables them. Stable and maintenance branches both use pnpm's native `main` lane. Git branch names and npm tags are separate values.

Maintenance ranges must have finite upper bounds and cannot overlap. The primary stable line owns versions outside all maintenance ranges. These ranges apply to every publishable package in the repository; packages with independent major versions must fit the chosen line together. Private packages remain native versioning participants but are not publish candidates. Branches, npm tags, and prerelease lanes must be unique. Semver-like tags such as `1.x` are invalid npm tags; use `legacy-1`. The `snapshot-` tag prefix is reserved for temporary packages.

```bash
repo release plan --branch 1.x --markdown
repo release plan --branch master --json
```

Plans expose `branchRule` with `branch`, `kind`, `lane`, `range`, `excludedRanges`, `distTag`, and `target`. An explicit `--branch` (or API `branch`) takes precedence; a matching `GITHUB_REF_NAME` is used next; otherwise a read-only plan targets the primary stable branch. Execution uses the actual Git branch or CI ref and rejects unconfigured branches. `resolveReleaseBranches(config)` exposes the same validated mapping to API callers.

Preparation checks native pnpm's dry-run before release hooks or version writes, then checks again after verification hooks. Invalid ranges block without consuming intents. Native applied manifests and final publication candidates are rechecked; a hook that changes versions must leave them within the selected line. Arbitrary hook side effects cannot be rolled back by repoctl. The existing pnpm ledger and release checkpoints govern continuation after an interrupted preparation or publication.

Release PRs target the selected branch. The primary head remains `release/pnpm-version`; maintenance heads use `release/pnpm-version-<encoded-branch>` so multiple lines can coexist. Maintenance publication uses its own dist-tag and stable GitHub Release metadata. `repo release pre enter beta` selects a declared native lane. `repo release pre exit` returns to the target's native `main` lane and prints the stable/maintenance target; it does not switch Git branches.

After changing the mapping, preview `repo upgrade --dry-run --json` and apply the reviewed upgrade to synchronize managed Release workflow push branches. Saved plans detect changed configuration, repeated upgrades are unchanged, and custom workflows remain protected unless explicitly replaced. Workflow dispatch and source recovery must run on the intended configured branch. Keep publish workflows serialized and retain their checkpoints.

## Common branches

- Missing intent: add a changeset and rerun the plan.
- Fixed group mismatch: inspect the package relationships before editing versions.
- Registry authentication failure in CI: run the OIDC audit below from the publishing workflow and inspect npm package settings.

## Audit npm trusted publishing

Choose `oidc-audit` when manually dispatching the managed Release workflow, or run this in your existing GitHub-hosted publishing job:

```bash
pnpm exec repo release ci --mode oidc-audit
```

The job needs `id-token: write`, Node.js 24.22.1 and the same repository, workflow file and environment as actual publishing. A different diagnostic workflow has a different identity. The managed workflow uses a separate audit job with only `contents: read` and `id-token: write`, disables install lifecycle scripts and skips GitHub App credentials and release quality checks. Only the repoctl source workspace builds its tooling closure; consumer workflows use the installed CLI. Custom workflows should use the same isolation and install with `pnpm install --frozen-lockfile --ignore-scripts`.

The command independently routes before release configuration and checks every versioned public child package against the official npm registry, including packages already published. It requests short-lived exchange credentials but never uploads packages, changes versions/intents, runs hooks, writes progress files, creates tags/Releases or saves tokens. `source-sha`, `dry-run`, `package` and `version` recovery inputs must be empty. JSON includes `schemaVersion: 1`, safe identity fields, each package's HTTP status/message and `ok`; failures complete the whole package report before exiting with code 1. `auditReleaseOidc({ cwd, env?, fetch? })` exposes the same report without printing it; callers must check `ok`.

An npm HTTP 404 or `OIDC token exchange error - package not found` does not by itself distinguish a missing package, mismatched trust or expired configuration. Check the npm package's trusted publisher status and compare repository, workflow and environment with the safe identity report. Never paste JWTs or exchange tokens into logs or support requests.

Under [npm's initial validation policy](https://github.blog/changelog/2026-10-02-unvalidated-npm-trusted-publishing-configurations-now-expire/), configurations without a first successful publish expire after 48 hours. If the npm page explicitly shows `Expired`, delete and recreate that package's trusted publisher, then complete the first publish within 48 hours. Editing an expired configuration does not reset it. Existing configuration, successful exchange and successful first publish are separate evidence; an audit does not reset or satisfy this clock. After the first successful publish, that initial 48-hour limit no longer applies. Use OIDC/provenance for publication and keep npm token fallbacks out of publishing jobs.

## Partial publication and registry visibility

The publisher attempts uploads at most three times, waiting 20 and 40 seconds before refreshing registry state and selecting retry packages. An exact version with explicit upload acceptance is never uploaded again during that invocation, even if `npm view` cannot find it yet. Ordinary permission errors and 404 responses without transient-failure evidence fail immediately. Conflicts require read-only registry confirmation.

Upload acceptance means npm received the version; registry queries can still take several minutes to show it. Accepted uploads must become queryable before post-publish hooks, Git tags, GitHub Releases, or prerelease pushes proceed. Visibility checks query pending versions every 10 seconds for up to 15 minutes. A timeout exits unsuccessfully and lists pending versions while preserving the acceptance evidence.

Two files remain in the workspace root:

- `pnpm-publish-summary.json`: cumulative `publishedPackages`, including accepted uploads and registry-confirmed versions. On failure, this file alone does not prove that every listed version is available.
- `repoctl-publish-progress.json`: `schemaVersion: 1`, `candidates`, `acceptedPackages`, `confirmedPackages`, and `status` (`publishing`, `confirming`, `complete`, or `failed`). Accepted versions missing from `confirmedPackages` still need visibility confirmation.

The managed Release workflow uploads both files as `npm-publish-progress-<run_id>-<run_attempt>` on success or failure, retained for 14 days. Missing reports are ignored. After upgrading repoctl, run `repo upgrade` to refresh managed workflows; custom workflows can add the same upload step.

After a visibility timeout, keep the durable checkpoint on `repoctl-release-state` and resume with `repo release ci --mode publish --source-sha <full-release-line-commit-sha>`, previewing with `--dry-run` first. Recovery uses the original prepared versions and saved acceptance evidence to confirm visibility and finish missing metadata without uploading accepted versions again.

## Recovery across runners

`repo release ci --mode=publish` tracks release targets separately from new npm uploads. Before uploading, the built-in GitHub client writes exact versions, original commits, accepted-upload evidence, metadata progress, and individual hook states to the repository's `repoctl-release-state` branch. The key includes repository, dist-tag, and candidate versions. Writes compare the file SHA to reject concurrent changes. Keep this branch, grant `contents: write`, and serialize all workflows that publish the same packages.

`repoctl-release-progress.json` is an archived diagnostic copy. Its `complete: true` requires npm version/dist-tag visibility, tags pointing to the original commits, published GitHub Releases, and all required hooks. The older npm progress file only describes the npm stage.

Reruns query the registry and GitHub and finish missing stages without reuploading accepted versions or repeating completed hooks. Prereleases push the version commit before uploading. Source discovery requires complete Git history (`fetch-depth: 0`), and recovery checks the original manifest and changelog. If a later commit changed the changelog, check out the reported original commit before recovery.

When `.changeset/ledger.yaml` records a package version, its first appearance along Git's first-parent history identifies the prepared release, including a first release that keeps the package's initial version. A release merged without squashing belongs to the mainline merge commit. Versions without ledger entries, such as dependency-propagated bumps, fall back to manifest history on the same first-parent chain. Uncommitted ledger entries cannot establish a release source. Recovery also rejects adding or deleting a changelog relative to that source; it permits a missing changelog only when both the source and current checkout omit it.

Legacy releases without a checkpoint use npm `gitHead`; if absent, verify the source manually and set `REPO_RELEASE_SOURCE_SHA`. Never substitute the rerun HEAD. Historical targets with existing Releases remain no-ops. Hooks for legacy targets with missing metadata have unknown outcomes.

```bash
repo release ci --mode=publish --dry-run
repo release ci --mode=publish
```

Dry-run queries remote state and shows versions, original commits, npm stage, missing tags/Releases, and hook states without uploads, hooks, or checkpoint writes. Unknown registry states fail after bounded retries. Tag conflicts and unknown source commits fail without moving tags. GitHub requests have a 30-second timeout and bounded backoff.

### Hook outcomes

Hook script names must be unique; retain the original script set when recovering. Each hook is checkpointed as `running` before execution and `complete` after success. Optional failures become `ignored`. Unknown non-idempotent outcomes require manual review. Set `idempotent: true` on an `afterPublish` hook only when repeated execution is safe. After verifying external completion, `REPO_RELEASE_ACKNOWLEDGE_HOOKS=script-name` acknowledges it without execution (comma-separated for multiple scripts).

If a runner disappears during upload before responses are persisted, recovery performs read-only visibility confirmation for up to 15 minutes. It fails with evidence if versions remain unknown, rather than blindly uploading again. After manually verifying that a version was never uploaded, use the existing exact `publish-unpublished` entry, then rerun the original target set to finish its hooks. Arbitrary external hooks cannot be guaranteed exactly-once.

Legacy injected `GitHubOperations` adapters retain their previous behavior. Recovery-capable adapters must implement `readReleaseState`, `writeReleaseState`, `listReleases`, and `ensureTag`; `readTagTarget` is recommended. Enforce revision comparison on writes and throw on query errors. A local summary is not a remote checkpoint.

## No-release intents and original-source recovery

An intent containing only `none` (or empty frontmatter) records that no release is needed. It does not open a version PR or block publishing an already prepared release. Consumed intents resurrected by a merge are not versioned twice. pnpm cleans these files during the next effective version operation.

Release PRs use the applied package list returned by pnpm, not arbitrary Git changes. A new package can keep its initial version; it still appears in the release notes. Cleanup alone never opens a release PR.

If an existing prepared version has not completed publication, new version preparation stops before consuming intents and prints its source commit and recovery command. Finish that release first, then run preparation again:

```bash
repo release ci --mode publish --source-sha <full-release-line-commit-sha> --dry-run
repo release ci --mode publish --source-sha <full-release-line-commit-sha>
repo release ci --mode prepare
```

The managed Release workflow exposes the same `source-sha` input for `publish` and `publish-unpublished`. Current tooling checks out the original commit into an isolated directory, installs its locked dependencies, builds and verifies that source, and recovers the full set of versions introduced by its manifests or ledger, including dependency propagation. Package/version inputs validate membership; they do not split the original release. The SHA must belong to `origin/<selected-branch>`; the dispatch configuration determines the line, including when the historical source had a different configuration. Dry-run only inspects the source and remote release state; it does not install, upload, run hooks, or write checkpoints. Later changes stay pending for a new version. The original source must already include all intended version changes; no versions are changed during recovery.

Recovery preserves GitHub's workflow environment for trusted publishing and provenance: its signed identity refers to the workflow run's commit. The isolated checkout, release checkpoint, Git tags, and Release targets refer to `source-sha`. Do not overwrite `GITHUB_SHA` to recover an older source; npm rejects provenance that disagrees with the signed workflow identity.

Validation scripts (`qualityScripts` and `hooks.verify`) do not inherit control inputs for the current release, such as its mode or recovery source. They retain ordinary CI and authentication environment variables. Other lifecycle hooks keep their release context.

## Managed nightly publication

The managed Release workflow includes a manual nightly entrypoint. Open **Actions → Release → Run workflow**, select the repository's default branch, and choose **nightly**. Leave the `source-sha`, `package` and `version` recovery inputs empty. The optional `dry-run` input inspects source and provider state without building or publishing. Nightly selects all public workspace packages from the snapshot plan and does not consume release intents or change stable versions, ledger, changelogs or Git tags.

New projects include this manual workflow without an automatic schedule. To enable a daily check at 03:17 Asia/Shanghai (19:17 UTC), add:

```ts
export default {
  commands: {
    release: {
      nightly: {
        provider: 'npm',
        schedule: '17 19 * * *',
        qualityTimeoutMs: 60 * 60_000,
      },
    },
  },
}
```

`provider` defaults to `npm`. Omit `schedule` to keep manual runs only; schedules use five-field UTC cron expressions and GitHub may delay them. After changing either setting, preview and apply the managed asset upgrade:

```bash
pnpm exec repo upgrade --json > ../repoctl-upgrade-plan.json
# Review the saved plan before applying it.
pnpm exec repo upgrade --apply ../repoctl-upgrade-plan.json
```

Commit the configuration, workflow and `.repoctl/baselines/root` records to the default branch. Existing projects first need a repoctl version that includes nightly and an updated lockfile. Fresh scaffolds record a Release workflow baseline; preserve it for future merges. Missing baselines and conflicting local edits require explicit resolution; `--yes` does not bypass them. Custom workflows stay protected, and preset-owned workflows are updated through `repo presets plan` / `repo presets apply`. `repo init --preset standard` does not install workflows; `--overwrite-release` is an explicit full replacement of a custom Release workflow. Remove `schedule` and synchronize again to disable automatic runs. `repo doctor` checks provider, schedule and workflow drift.

### Choose a provider

| Provider        | Installation                     | Same-commit manual run                                                            | Requirements                                                                                                                                |
| --------------- | -------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm` (default) | `<package>@snapshot-nightly`     | New build identity and snapshot versions                                          | npm Trusted Publisher for every public package, matching the repository, `release.yml` and environment; `contents: read`, `id-token: write` |
| `pkg-pr-new`    | Full-commit URLs from the report | Verify existing bytes, reuse identical artifacts and upload only missing packages | Official pkg.pr.new GitHub App installed for the repository; `contents: read`; no npm token or npm Trusted Publisher                        |

For npm, run the `oidc-audit` workflow mode before first use and check every package's npm settings. Nightly repeats the audit for its exact package plan before uploading, uses OIDC/provenance, confirms exact versions and `snapshot-nightly` tags, and verifies that `latest` did not change. Install one of your project's published packages with:

```bash
pnpm add -D <package>@snapshot-nightly
```

To use `pkg-pr-new`, install the [official GitHub App](https://github.com/apps/pkg-pr-new), grant it access to this repository, set `provider: 'pkg-pr-new'` and synchronize the workflow. This provider returns URLs shaped like `https://pkg.pr.new/<owner>/<repo>/<package>@<full-commit-sha>` and rewrites internal dependencies to the same batch. It does not publish npm dist-tags. Existing URL metadata or bytes that disagree with the prepared artifact fail the run rather than being overwritten.

Scheduled npm checks skip only when every current public package is already available for the current commit and the same build identity. Missing or partially published packages require preparation; registry/query failures fail the run. A manual npm run always starts a new batch, even for the same commit. Both scheduled and manual pkg-pr-new runs rebuild and compare bytes, reusing only identical artifacts at that commit's URLs and uploading only missing packages.

### Checks and diagnostics

Nightly runs configured `qualityScripts` and `hooks.verify`, prepares real tarballs from committed source outside the checkout, and validates package exports, types and isolated installation. Versions include the base version, nightly marker, full commit SHA and build digest. After publication, a clean consumer installs the actual tags or URLs and checks identities, entrypoints and types. Formal versioning and post-publication hooks remain part of the normal release flow.

Each quality script and verify hook has its own timeout, defaulting to `2_700_000` milliseconds (45 minutes). Set `commands.release.nightly.qualityTimeoutMs` to a positive safe integer number of milliseconds to override it; the example above allows 60 minutes per script. The workflow's job timeout still limits the whole run, so increase that separately if the combined work needs more time. A timeout stops publication and retains the command's output in the diagnostic report.

The workflow uses Node.js 24.22.1, the workspace's pinned pnpm, checkout without persisted credentials and the existing publication concurrency group. Reports, tarballs and consumer diagnostics are retained for 14 days, including failed runs; the Actions summary contains the result and install commands.

The workflow command is:

```bash
REPOCTL_SNAPSHOT_PUBLISH=1 pnpm exec repo release nightly \
  --publish --output "$RUNNER_TEMP/repoctl-nightly" --json
```

`repo release nightly`, `createNightlyPlan(options)` and `releaseNightly(options)` require a complete GitHub Actions schedule or nightly dispatch context on the default branch, even for a dry run. Without `--publish`, execution prepares artifacts; `--dry-run` only inspects and emits an external report. Use the snapshot command below for local preparation.

## PR and nightly snapshots

Use a snapshot for downstream validation before a stable release. Commit the source first and preview the complete set of public workspace packages:

```bash
repo release snapshot --kind pr --pr 123 --commit <full-HEAD-sha> --build-id <run-id>-<attempt> --dry-run --json
repo release snapshot --kind nightly --commit <full-HEAD-sha> --build-id <run-id>-<attempt> --output /tmp/repoctl-artifacts
```

The command reuses the native pnpm release plan for candidate explanations and base versions, then snapshots every public package together. Versions include the full source SHA and a deterministic digest of the PR/nightly build identity. The only tags are `snapshot-pr-<number>` and `snapshot-nightly`; there is no option to target a stable tag. Reuse a build identity only to recover the same source and artifacts. The report contains exact `pnpm add` instructions.

Snapshot planning through the CLI and API does not load or execute `repoctl.config.*`. It uses committed pnpm metadata independently of stable release configuration; ordinary release commands still validate their configuration before running.

Without `--publish`, the command prepares installable tarballs. It extracts committed HEAD outside the repository, installs the frozen lockfile, rewrites internal references to exact snapshot versions, runs the root `build` script, and checks the packed files with publint, Are the Types Wrong, and isolated consumers. Original manifests, intents, ledger, changelogs and Git refs stay unchanged on success, failure or interruption. Failed and completed runs retain `snapshot-report.json`, tarballs, and diagnostic consumers under the reported directory. A hard interruption can leave partial output; rerun the same identity to reconcile registry evidence. Source symlinks, Git submodules and `publishConfig.directory` are currently rejected; the root build script and frozen lockfile are required.

Add `--publish` only in an explicitly authorized GitHub Actions job with `REPOCTL_SNAPSHOT_PUBLISH=1`. `GITHUB_SHA` must match the requested commit and the event repository must match `GITHUB_REPOSITORY`. PR publication requires a same-repository `pull_request` event; forks and `pull_request_target` cannot publish. Nightly publication accepts `schedule` or `workflow_dispatch`. Keep fork jobs on preparation only and scope credentials to the trusted publishing job. The snapshot command does not edit workflow files.

Publication defaults to the public npm registry; `--registry <https-url>` explicitly selects another registry (HTTP is supported only for a local test registry). Uploads reuse the bounded publication/recovery adapter and never create GitHub Releases or Git tags. Repeated identities compare exact package metadata and SHA-512 tarball integrity before skipping an upload. Unknown registry state or conflicting bytes stop publication. A changed or non-reproducible build needs a new `--build-id`.

The public APIs are `createSnapshotPlan(options)` and `releaseSnapshot(options)`. Both expose `schemaVersion: 1`, the native plan, snapshot identity, candidates, exact versions, target tag and install instructions. `releaseSnapshot` adds retained artifacts and validation results; preparation failures return `status: failed` with `error`, and the CLI exits with code 1.

### Publish a prepared PR snapshot from a separate trusted workflow

For PR snapshots, export the approved builder and independent publisher together:

```bash
repo release snapshot workflow --out .github/workflows --pnpm-version 12.14.0 --dry-run --json
repo release snapshot workflow --out .github/workflows --pnpm-version 12.14.0
```

Select the exact pnpm 12 version declared by the workspace's `packageManager`. The command creates `repoctl-snapshot-build.yml` and `repoctl-snapshot-publish.yml`; it protects existing different files and treats identical files as a no-op. To upgrade or customize the recipe, export into an empty directory, review both files together, and replace the reviewed pair. The publisher embeds the SHA256 of the exact builder bytes, so changing only the builder makes verification fail. Export pins the installed repoctl version; merge the reviewed pair into the default branch before use. This recipe is opt-in and does not change the ordinary PR CI or Release workflow.

Create a `pr-snapshot` environment with required reviewers and administrator bypass disabled. Configure each package's npm Trusted Publisher for this repository and `repoctl-snapshot-publish.yml`. The publisher uses the built-in GitHub token and npm OIDC; no GitHub App or PAT is needed. The freeze job waits for environment approval before obtaining a runner. Dispatch **repoctl PR snapshot build** on the default branch with an open, ready, mergeable, same-repository PR number. Fork PRs cannot use this publisher.

The same exporter can match an existing publisher identity and approval environment:

```bash
repo release snapshot workflow --out reviewed-workflows \
  --environment package-review \
  --builder-workflow .github/workflows/pr-packages.yml \
  --publisher-workflow .github/workflows/release.yml \
  --builder-name "Approved PR packages" \
  --publisher-name "Publish PR packages"
```

The output directory receives `pr-packages.yml` and `release.yml`. Review these files before placing them at the configured repository paths; existing files are never merged or overwritten. The exported builder source command, publisher verification policy, `workflow_run` name, npm publisher identity and exact builder SHA256 all agree. Paths must be distinct YAML files directly under `.github/workflows`; names and the environment must be static values. A hand-maintained publisher can pass `snapshot publish-prepared --publisher-workflow .github/workflows/release.yml` along with its matching builder and environment options. The workflow must still run as the trusted default-branch `workflow_run` publisher. Each npm package can have up to ten trusted publishers, so retaining the default snapshot publisher alongside an existing release publisher is also an option.

The protected freeze job reads the current PR head/base/merge and immutable run identity, checks the merge parents, and creates the package/version/dependency plan using the pinned tool without installing or executing candidate code. It uploads `snapshot-plan.json` and records its artifact ID, digest and plan digest in its own job log. A separate job checks out the frozen merge commit, builds and validates the exact package closure with read-only permissions, and uploads only `snapshot-manifest.json` and its declared tarballs. Schema version 1 records repository and PR identity, full head/base/merge SHAs, workflow/run/attempt, exact snapshot versions and dependency edges, SHA512 integrity, and build/package checks.

The default-branch `workflow_run` publisher verifies the trusted builder bytes, reviewer environment, approval, successful freeze/build jobs from the same attempt, the trusted freeze log, immutable artifact IDs and ZIP digests, and the current PR revision. It compares every package and dependency with the frozen plan and checks every tarball before requesting npm credentials. Extra or missing packages, altered bytes, unsafe paths, dangerous `publishConfig`, forks and stale revisions fail before upload. Missing or expired approval logs/artifacts require a fresh approved build.

The publishing job has no candidate checkout and never installs, imports or runs candidate code or package scripts. It uses the public OIDC audit with the real publisher identity, then publishes only the checked tarballs under `snapshot-pr-<number>`. It preserves `latest`, confirms registry integrity and the snapshot tag, and retries existing exact versions only when their integrity matches. A per-PR publication lock prevents competing uploads; an older build cannot roll the tag back. Npm publication is not an atomic batch: a failed run can leave confirmed packages, and retrying the same unchanged artifact reconciles them. Re-run all builder jobs for a new approval after a build failure; a publisher retry reuses the original builder run, attempt and immutable artifacts. Changes to PR head/base/merge require a new build.

A separate consumer job without OIDC or write permissions installs the confirmed exact versions and checks their integrity, runtime entrypoints and types. A trusted reporting job writes the exact install command and the GitHub consumer job result to the PR. Consumer failures leave the workflow failed while reporting the packages that were already published. Provenance identifies the actual default-branch publisher; the manifest and report retain the separately verified candidate build source. The workflow never rewrites GitHub event or SHA variables to impersonate the builder.

The workflow uses these public CLI/API boundaries:

| Task                            | CLI                                                                                                                             | API                                       |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| Resolve frozen GitHub source    | `snapshot source --pr <N> --out <source.json>`                                                                                  | `freezeSnapshotSource(options)`           |
| Plan checked-out metadata       | `snapshot freeze --source <source.json> --out <snapshot-plan.json>`                                                             | `createSnapshotBuildPlan(options)`        |
| Build portable artifacts        | `snapshot prepare --plan <snapshot-plan.json> --output <external-directory>`                                                    | `prepareSnapshot(options)`                |
| Verify completed build          | `snapshot verify --run-id <id> --run-attempt <attempt> --builder-sha256 <trusted-hash>`                                         | `verifySnapshotRun(options)`              |
| Publish the verified bundle     | `snapshot publish-prepared --run-id <id> --run-attempt <attempt> --builder-sha256 <trusted-hash> --output <external-directory>` | `publishPreparedSnapshot(options)`        |
| Verify exact installed packages | `snapshot verify-consumer --report <publication.json> --output <external-directory>`                                            | `verifyPreparedSnapshotConsumer(options)` |

Prefix the CLI entries above with `repo release`. The source and verifier infer the repository from `GITHUB_REPOSITORY`, or accept `--repository <owner/repo>`. `--json` emits structured results and `--out` writes a new result file. `snapshot seal` binds the uploaded plan to the trusted freeze log. `getSnapshotWorkflows({ pnpmVersion?, environment?, builderWorkflowPath?, publisherWorkflowPath?, builderWorkflowName?, publisherWorkflowName? })` returns the matched workflow strings using the same settings as the exporter. The prepared publisher supports public npm only; the existing local snapshot and nightly APIs remain compatible. All snapshot subcommands skip executable release configuration and leave formal changesets, versions, changelogs and the release ledger untouched.

## Next

Read [publishing and changelogs](/learn/monorepo/publish) for repository policy and [reports and output](/tasks/reports) for CI artifacts.
