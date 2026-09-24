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

After a failure, download the artifact and reconcile exact versions with `npm view <name>@<version> version`. Continue read-only checks for accepted but unconfirmed versions instead of rerunning the entire release lifecycle. Use the workflow's `reconcile` mode to repair metadata for visible versions, and `publish-unpublished` only for versions verified as still requiring upload. Reports are diagnostic: a new invocation does not trust old reports or automatically resume across processes.

## Next

Read [publishing and changelogs](/learn/monorepo/publish) for repository policy and [reports and output](/tasks/reports) for CI artifacts.
