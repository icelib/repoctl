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
