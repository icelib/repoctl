# Frozen Release PR validation

Copy `workflow.yml` into a reusable workflow and `policy.json` to
`.github/release-validation.json`. Replace both version placeholders with exact
published repoctl and pnpm versions containing `release validate-preparation`.
Use the same native pnpm version for preparation and validation. Do not assume an
older published repoctl version contains this command.

The caller freezes full base/head commit IDs and supplies any required CI
approval before invoking the workflow. Branch names can select this validation
path, but only a `valid` report exempts a version-preparation PR from ordinary
release-intent admission. Invalid results must fail admission rather than fall
back to accepting deleted changeset paths.

The command reads policy JSON from the frozen base Git blob, and reads no
executable repository configuration. The base supplies workspace definitions,
native versioning settings, manifests, existing changelogs, pending intents and
ledger. Only inert metadata is copied to a disposable directory. Native pnpm
solves and applies versions there with scripts and pnpmfile disabled. No package
installation, candidate module, release hook or configuration dependency runs;
the source checkout, index and Git refs remain untouched.

The schema-versioned report lists each native package's versions, lane, native
reasons and validation status, plus expected, missing, mismatched or unexpected
files. Fixed groups and indirect dependency releases use the native result even
when no independent ledger entry or version increment exists. Historical
changelog content must match the native replay exactly. Native pnpm currently
leaves the lockfile unchanged; a lockfile edit cannot claim this exemption.

Additional outputs require an exact path and SHA-256 in trusted policy:

```json
{
  "branch": "main",
  "generatedFiles": [
    { "path": "generated/release.txt", "sha256": "REPLACE_WITH_64_HEX_DIGITS" }
  ]
}
```

For content derived from planned versions, trusted API callers may instead
supply `validate(context)`, returning a boolean or promise. The context contains
read-only copies of before/after bytes, frozen SHAs and planned packages. Never
load that callback from the candidate checkout. Callbacks and digests cannot
override manifests, changelogs, intents, ledger, workspace configuration or the
lockfile. Duplicate paths, traversal paths and unverified outputs fail closed.

Registry settings come from the trusted execution environment and frozen base
`publishConfig`. The candidate `.npmrc` is excluded. A validation runner must have the pinned pnpm available;
Corepack downloads and automatic pinning are disabled during replay. Network
registry reads used by the native solver can still occur. No publishing token
is needed.
