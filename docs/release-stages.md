# Staged releases and registry confirmation

The default `repo release ci` (`--stage all`) preserves the existing lifecycle. The managed `release.yml` runs the same release contract as six real steps in one job:

| Stage    | Responsibility                                                                                                                     |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| plan     | Resolve trigger, mode, release line and recovery source; output `run` / `publish` conditions.                                      |
| verify   | Run preparation guards, beforeVersion when applicable, quality scripts and verify hooks.                                           |
| prepare  | Consume intents, run afterVersion, create the stable Release PR or commit/push prerelease versions. Stable preparation stops here. |
| upload   | Upload only versions without acceptance evidence, persisting partial progress.                                                     |
| confirm  | Read-only registry confirmation of exact versions and intended dist-tag; no npm publish.                                           |
| finalize | Tags, GitHub Releases and checkpointed afterPublish hooks.                                                                         |

Use stages in order with the same checkout, configuration and GitHub Actions run. Receipts live in the Git directory; `repoctl-ci-progress.json` is a diagnostic artifact. Receipts bind the repository, source SHA, tracked/untracked source changes, exact candidate versions, configuration, mode, selection and run/attempt. Changing any of these requires restarting at plan/verify. Receipts are not portable verification grants. A new runner must verify again; existing schema-1 durable release checkpoints still preserve accepted uploads and completed hooks. Failed stages preserve progress. Repeating a completed stage does not rerun its hooks.

Source recovery uses a single isolated checkout under the Git directory across stages; it installs and verifies historical sources once, preserves the dispatch workflow's OIDC identity, and removes the checkout after successful finalization. An interrupted recovery retains its checkout and diagnostic progress for resumption.

OIDC workflows must not use setup-node's `registry-url`: that option creates an `_authToken=${NODE_AUTH_TOKEN}` placeholder even though trusted publishing does not need a static token. Keep `npm_config_registry=https://registry.npmjs.org`, `id-token: write`, a supported npm version and provenance enabled. Token-based or custom registry workflows can continue using their own npm authentication.

```ts
export default {
  commands: {
    release: {
      registry: {
        concurrency: 4,
        requestTimeoutMs: 10_000,
        visibilityTimeoutMs: 900_000,
      },
    },
  },
}
```

Public packages on the official npm registry use native HTTP with pooled connections. npmrc/env configuration is resolved with npm's configuration reader; custom registries, authentication, restricted access and custom proxy/TLS transport retain npm CLI queries. Positive HTTP version metadata is cached within the operation; delayed tags are rechecked independently. The first confirmation is immediate, followed by 2-second polls before 30 seconds, 5-second polls until two minutes, and 10-second polls thereafter. Requests/retries share the remaining deadline. 404 means pending, 401/403 fails clearly, and network errors/429/5xx receive at most three attempts with diagnostics. Unknown registry state never authorizes another upload. Accepted uploads never return to the retry queue.

The observed weapp-stylex release on 2026-10-09 took 6m7s, including 4m21s of visibility waiting and 12 missing-token warnings: <https://github.com/weapp-stylex/weapp-stylex/actions/runs/37913908235>. The new client reduces subprocess and serial-query overhead; it cannot remove real npm propagation delay. Reproduce read-only overhead measurements with already-published latest versions:

```sh
node scripts/benchmark-release-registry.mjs repoctl@5.9.0 --rounds=3
```

The report separates query latency from propagation wait; it does not manufacture releases or claim an end-to-end speedup.

## Managed nightly packages

The managed `release.yml` includes **Actions → Release → Run workflow → mode: nightly** for every generated workspace. Select the repository's default branch and leave `source-sha`, `package`, and `version` empty. Manual nightly publication is available without configuration; automatic publication requires an explicit schedule. The `dry-run` input inspects the source and provider state without running quality scripts, building or publishing.

```ts
export default {
  commands: {
    release: {
      nightly: {
        provider: 'npm',
        schedule: '17 19 * * *',
      },
    },
  },
}
```

`provider` defaults to `npm`; `pkg-pr-new` is also supported. `schedule` is an optional five-field UTC cron expression. The example checks daily at 03:17 Asia/Shanghai (19:17 UTC); GitHub may delay scheduled runs. The repoctl source repository explicitly enables this schedule. Published templates omit the source schedule and source-only quality policies, while retaining the generic nightly job and manual option.

### Install or update the managed workflow

New workspaces include the manual workflow and its root asset baseline under `.repoctl/baselines/root`. Commit that baseline with the generated files so future upgrades can merge local changes. Existing projects should update their repoctl dependency and lockfile, then preview and apply the asset upgrade:

```sh
pnpm exec repo upgrade --json > ../repoctl-upgrade-plan.json
pnpm exec repo upgrade --apply ../repoctl-upgrade-plan.json
```

Review the saved plan before applying it. Repeat this process after changing the nightly provider or schedule, then commit the configuration, workflow and baselines to the default branch. Removing `schedule` and synchronizing the workflow disables automatic nightly publication while retaining manual runs. `repo doctor` reports configuration/workflow drift.

Root-managed assets use their recorded baselines; preset-owned workflows stay under `repo presets plan` / `repo presets apply`. Custom workflows remain protected. A missing baseline or merge conflict requires explicit resolution; `--yes` does not bypass it. `--overwrite-release` deliberately replaces a custom Release workflow and is not required for ordinary managed upgrades. `repo init --preset standard` does not install workflows.

### Provider behavior

| Behavior                        | npm                                                   | pkg-pr-new                                                                |
| ------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------- |
| Install target                  | `<package>@snapshot-nightly`                          | `https://pkg.pr.new/<owner>/<repo>/<package>@<full-commit-sha>`           |
| Workflow permissions            | `contents: read`, `id-token: write`                   | `contents: read`                                                          |
| Manual rerun of the same commit | New `run_id-run_attempt` build identity and versions  | Verify and reuse identical full-commit URLs; upload only missing packages |
| Existing artifact conflict      | Fail if exact-version metadata or integrity disagrees | Fail if metadata or bytes disagree; do not overwrite occupied URLs        |

For npm, verify every selected public package's Trusted Publisher names the current repository and `release.yml` with the same environment as the publishing job. The nightly job audits all selected packages before uploading, uses OIDC/provenance, and requires no static npm token. After publication it confirms exact versions, integrity and `snapshot-nightly` tags, and checks each package's `latest` tag against the pre-publication baseline.

```sh
pnpm add -D repoctl@snapshot-nightly
pnpm create repoctl@snapshot-nightly my-project
```

These install commands target repoctl's own npm nightly packages. Consumer projects use their own package names. Before using `pkg-pr-new`, install the [official GitHub App](https://github.com/apps/pkg-pr-new) and grant it access to the publishing repository. Use the full-commit URLs from the report; internal workspace dependencies point to URLs in the same batch. This provider does not publish npm versions or dist-tags and does not run npm Trusted Publisher checks.

Scheduled npm runs skip only when every current public package already points to the current source SHA and one consistent build identity. Missing packages or partial publication trigger preparation; registry/network errors fail the job instead of being treated as missing packages. Manual npm runs always prepare a new batch. Both scheduled and manual pkg-pr-new runs rebuild and compare the resulting bytes with existing immutable URLs, reusing only identical artifacts and uploading only missing packages.

### Checks, artifacts and execution boundary

Package selection comes from the existing snapshot plan and includes every public workspace package. The nightly engine runs the configured `qualityScripts` and `hooks.verify`; the source repository explicitly uses build → lint → typecheck → tsd → tests plus workflow contract checks. It extracts the committed source outside the checkout, builds real tarballs, verifies package exports/types and isolated installation, and rewrites internal dependency references for the selected provider. Versions retain the existing base version, nightly marker, full commit SHA and build digest.

The workflow invokes:

```sh
REPOCTL_SNAPSHOT_PUBLISH=1 pnpm exec repo release nightly \
  --publish --output "$RUNNER_TEMP/repoctl-nightly" --json
```

This command requires a complete GitHub Actions `schedule` or nightly `workflow_dispatch` context on the repository's default branch, including for `--dry-run`. Without `--publish` it prepares artifacts; `--dry-run` only inspects and writes an external report. Use `repo release snapshot` for local snapshot preparation. `createNightlyPlan(options)` and `releaseNightly(options)` expose the same guarded orchestration through the public API.

After publication, both providers install the reported targets in a clean consumer and verify package identity, runtime entrypoints and types. The Actions summary includes provider, status and install commands. JSON reports, consumer diagnostics and tarballs are retained for 14 days even on failure. Publishing shares the existing release concurrency group and does not cancel an upload in progress. Nightly leaves formal versions, release intents, the ledger, changelogs and Git tags untouched; versioning and post-publication hooks remain part of the formal release flow.

For npm, the clean consumer exempts only the confirmed batch's exact `name@version` entries from pnpm's release-age policy so newly published snapshots can be verified immediately. Other versions and dependencies retain pnpm's default policy; the source workspace's overrides and cooldown settings are not copied into the consumer.

If publication is confirmed but consumer verification fails, the run remains failed and its summary identifies the confirmed build. Review `nightly-report.json`, `consumer-report.json` and the retained tarballs before retrying. A scheduled npm run for the same commit may skip the already published batch without repeating consumer verification. After fixing the failure, if a new nightly publication is intended, manually run **Release → mode: nightly** with `dry-run: false`; this repeats the pipeline and publishes snapshots with a new build identity.
