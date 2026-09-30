# Release packages

Use this task when a change is ready to version and publish. Keep the release plan reviewable before any registry write.

## Prerequisites

- `repo doctor` reports a valid package manager and release configuration.
- The working tree is clean except for the intended changes.
- Every publishable change has a changeset or the repository's chosen intent file.

## Smallest command

```bash
repo release --dry-run
```

Review the package groups, versions, changelog entries, and publish commands. Run the same command without `--dry-run` only after the plan is approved.

## Expected result

The release report names the packages that will change, the version decisions, and each subprocess that will run. A successful release also completes the configured post-publish hooks.

## Common branches

- Missing intent: add a changeset and rerun the plan.
- Fixed group mismatch: inspect the package relationships before editing versions.
- Registry authentication failure: refresh the local token and rerun the publish step; do not commit credentials.

## Partial publication and registry visibility

The publisher attempts uploads at most three times, waiting 20 and 40 seconds before refreshing registry state and selecting retry packages. An exact version with explicit upload acceptance is never uploaded again during that invocation, even if `npm view` cannot find it yet. Ordinary permission errors and 404 responses without transient-failure evidence fail immediately. Conflicts require read-only registry confirmation.

Accepted uploads must become queryable before post-publish hooks, Git tags, GitHub Releases, or prerelease pushes proceed. Visibility checks query pending versions every 10 seconds for up to five minutes. A timeout exits unsuccessfully and lists pending versions.

Two files remain in the workspace root:

- `pnpm-publish-summary.json`: cumulative `publishedPackages`, including accepted uploads and registry-confirmed versions. On failure, this file alone does not prove that every listed version is available.
- `repoctl-publish-progress.json`: `schemaVersion: 1`, `candidates`, `acceptedPackages`, `confirmedPackages`, and `status` (`publishing`, `confirming`, `complete`, or `failed`). Accepted versions missing from `confirmedPackages` still need visibility confirmation.

The managed Release workflow uploads both files as `npm-publish-progress-<run_id>-<run_attempt>` on success or failure, retained for 14 days. Missing reports are ignored. After upgrading repoctl, run `repo upgrade` to refresh managed workflows; custom workflows can add the same upload step.

## Recovery across runners

`repo release ci --mode=publish` tracks release targets separately from new npm uploads. Before uploading, the built-in GitHub client writes exact versions, original commits, accepted-upload evidence, metadata progress, and individual hook states to the repository's `repoctl-release-state` branch. The key includes repository, dist-tag, and candidate versions. Writes compare the file SHA to reject concurrent changes. Keep this branch, grant `contents: write`, and serialize all workflows that publish the same packages.

`repoctl-release-progress.json` is an archived diagnostic copy. Its `complete: true` requires npm version/dist-tag visibility, tags pointing to the original commits, published GitHub Releases, and all required hooks. The older npm progress file only describes the npm stage.

Reruns query the registry and GitHub and finish missing stages without reuploading accepted versions or repeating completed hooks. Prereleases push the version commit before uploading. Source discovery requires complete Git history (`fetch-depth: 0`), and recovery checks the original manifest and changelog. If a later commit changed the changelog, check out the reported original commit before recovery.

Legacy releases without a checkpoint use npm `gitHead`; if absent, verify the source manually and set `REPO_RELEASE_SOURCE_SHA`. Never substitute the rerun HEAD. Historical targets with existing Releases remain no-ops. Hooks for legacy targets with missing metadata have unknown outcomes.

```bash
repo release ci --mode=publish --dry-run
repo release ci --mode=publish
```

Dry-run queries remote state and shows versions, original commits, npm stage, missing tags/Releases, and hook states without uploads, hooks, or checkpoint writes. Unknown registry states fail after bounded retries. Tag conflicts and unknown source commits fail without moving tags. GitHub requests have a 30-second timeout and bounded backoff.

### Hook outcomes

Hook script names must be unique; retain the original script set when recovering. Each hook is checkpointed as `running` before execution and `complete` after success. Optional failures become `ignored`. Unknown non-idempotent outcomes require manual review. Set `idempotent: true` on an `afterPublish` hook only when repeated execution is safe. After verifying external completion, `REPO_RELEASE_ACKNOWLEDGE_HOOKS=script-name` acknowledges it without execution (comma-separated for multiple scripts).

If a runner disappears during upload before responses are persisted, recovery performs read-only visibility confirmation for up to five minutes. It fails with evidence if versions remain unknown, rather than blindly uploading again. After manually verifying that a version was never uploaded, use the existing exact `publish-unpublished` entry, then rerun the original target set to finish its hooks. Arbitrary external hooks cannot be guaranteed exactly-once.

Legacy injected `GitHubOperations` adapters retain their previous behavior. Recovery-capable adapters must implement `readReleaseState`, `writeReleaseState`, `listReleases`, and `ensureTag`; `readTagTarget` is recommended. Enforce revision comparison on writes and throw on query errors. A local summary is not a remote checkpoint.

## No-release intents and original-source recovery

An intent containing only `none` (or empty frontmatter) records that no release is needed. It does not open a version PR or block publishing an already prepared release. Consumed intents resurrected by a merge are not versioned twice. pnpm cleans these files during the next effective version operation.

Release PRs use the applied package list returned by pnpm, not arbitrary Git changes. A new package can keep its initial version; it still appears in the release notes. Cleanup alone never opens a release PR.

If an existing prepared version has not completed publication, new version preparation stops before consuming intents and prints its source commit and recovery command. Finish that release first, then run preparation again:

```bash
repo release ci --mode publish --source-sha <full-main-commit-sha> --dry-run
repo release ci --mode publish --source-sha <full-main-commit-sha>
repo release ci --mode prepare
```

The managed Release workflow exposes the same `source-sha` input for `publish` and `publish-unpublished`. Current tooling checks out the original commit into an isolated directory, installs its locked dependencies, builds and verifies that source, and recovers the full set of versions introduced in its ledger. Package/version inputs validate membership; they do not split the original release. The SHA must belong to `origin/main`. Dry-run only inspects the source and remote release state; it does not install, upload, run hooks, or write checkpoints. Later changes stay pending for a new version. The original source must already include all intended version changes; no versions are changed during recovery.

## Next

Read [publishing and changelogs](/learn/monorepo/publish) for repository policy and [reports and output](/tasks/reports) for CI artifacts.
