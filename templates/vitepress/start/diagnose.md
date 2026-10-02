---
outline: deep
---

# repoctl Doctor

`repo doctor` diagnoses whether the current pnpm workspace is ready for development and release. By default it is read-only and offline: it does not execute pnpm/Corepack, activate or download a package manager, install dependencies, or rewrite files. Explicit report output via `--out` only writes the requested report.

## Statuses

- `pass`: the check is satisfied.
- `warn`: a recommendation needs attention, or the available evidence cannot establish consistency.
- `fail`: a required workspace contract is missing or invalid.

## Checks

Doctor covers the root `package.json`, `pnpm-workspace.yaml`, Node compatibility, the `repoctl` dependency, recommended `repo:*` scripts, `repoctl.config.ts`, commit hooks, workspace pattern coverage, tooling imports, and release configuration.

Check IDs and JSON fields remain stable in every locale.

## Runtime and installation evidence

| Check ID             | Evidence and status                                                                                                                                                                        |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `node-version`       | Current Node against `engines.node`; mismatch fails, missing/invalid ranges warn.                                                                                                          |
| `node-version-files` | Existing numeric `.nvmrc` / `.node-version` values against Node, each other and `engines.node`; contradictions fail. Files are optional; unresolved aliases such as `lts/*` warn.          |
| `package-manager`    | Exact `pnpm@<version>` in root `packageManager`; missing warns and incompatible declarations fail.                                                                                         |
| `pnpm-version`       | Observed version versus declaration; missing pnpm or a proven version mismatch fails. Unknown version warns.                                                                               |
| `lockfile-sync`      | Root and discovered workspace dependency specifiers against supported pnpm lockfile v9 importers. Proven mismatches fail; missing, malformed and unsupported lockfiles warn.               |
| `installation-state` | pnpm installation metadata, installed lockfile and required direct dependency manifests. Proven stale/missing dependencies fail; absent or unsupported metadata and partial installs warn. |

Run `pnpm exec repo doctor` to provide pnpm launch evidence. Doctor labels inherited `npm_config_user_agent` evidence explicitly; it can be overridden or stale. Outside a pnpm invocation it reads recognizable pnpm package metadata from PATH. A Corepack shim or an unrecognized standalone launcher means **unknown**, and is never executed to find a version.

Lockfile checks support pnpm v9 lockfiles, including pnpm 12's separate package-manager document, workspace protocols, default/named catalogs, and auto-installed peers (explicit dependency groups take precedence). Workspace override changes are compared separately from manifest specifiers. Transformed specifiers that cannot be verified (for example overrides or pnpmfile hooks) stay unknown. Installation checks support the isolated node linker with pnpm layout version 5 and read the configured virtual store from `.modules.yaml`. They compare lockfile records and confirm required direct dependency manifests exist; they do not verify every package byte, transitive link, optional platform dependency, lifecycle script, or external store. A `pass` therefore describes the recorded installation evidence, not an integrity audit.

After reviewing failures, explicitly select the declared Node/pnpm versions and run `pnpm install` as appropriate. Doctor does not perform these repairs or resolve aliases over the network. `env info`, snapshots and support bundles use the same non-executing pnpm observation.

## Reports

```bash
repo doctor --json
repo doctor --markdown
repo doctor --markdown --redact --out reports/doctor.md
```

`--redact` replaces workspace, current-directory, and home paths before output is shared.

## Strict Mode

```bash
repo doctor --strict
```

Normal mode exits non-zero for failures. Strict mode also treats warnings as blocking, which is useful for CI policy enforcement.

## Language

```bash
repo --lang zh-CN doctor
REPOCTL_LANG=zh-CN repo doctor
```

The explicit option wins over `REPOCTL_LANG`; English is the fixed fallback.
