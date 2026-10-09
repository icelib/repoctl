# Renovate

Renovate keeps dependencies current through reviewable pull requests. It is most useful when the configuration groups compatible updates, lets CI prove the upgrade, and avoids mixing unrelated ecosystem changes.

## Repository policy

```json
{
  "extends": ["config:recommended", "group:allNonMajor"],
  "rangeStrategy": "bump",
  "minimumReleaseAge": "7 days",
  "internalChecksFilter": "strict",
  "automerge": true,
  "automergeType": "pr"
}
```

The repository groups compatible minor and patch updates. Cloudflare Workers tooling is grouped separately because Wrangler and its Vite plugin have a deliberate compatibility relationship. Renovate waits seven days after each version is published before it can create an update branch or pull request. `internalChecksFilter: "strict"` keeps the stability check blocking, so a pending `renovate/stability-days` check does not appear as a pull request yet. The timer is evaluated for each version independently; it does not require a package to stop publishing for seven days. Security updates follow the same seven-day wait so every automated update gets the same validation window.

## Review an update

1. Read the package release notes when the update changes build, test, or deployment tooling.
2. Run the normal build and validation sequence against the updated lockfile.
3. Check generated assets and package metadata for unexpected churn.
4. Merge only after the configured checks prove the update is compatible.

Do not rely on commit-message directives for a retired deployment provider. Deployment behavior belongs in the active platform configuration and CI settings.

## Keep Reading

- [pnpm](./pnpm.md)
- [Add checks to CI](/tasks/ci)
- [Troubleshoot](/tasks/troubleshooting)
