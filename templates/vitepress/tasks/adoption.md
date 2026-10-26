# Adopt repoctl in an existing workspace

Keep repository policy and domain checks in your workspace. The public repoctl commands handle automatic change intents, frozen Release PR validation, native hook installation and prepared snapshot workflow configuration. These APIs are also exported from `@icebreakers/monorepo`.

## Automatic changesets

Put declarative policy in `.github/repoctl-auto-changeset.json` on the default branch. An empty object uses patch by default, minor for conventional `feat` titles, the `release:patch`, `release:minor`, `release:major` and `release:none` labels, and explicit release levels for breaking titles. Conflicting release labels fail; upgrading an external dependency to a major version does not itself select a major release for its consumer.

This example illustrates package relationships; replace these package names and paths with your own:

```json
{
  "schemaVersion": 1,
  "ignorePaths": ["**/test/**", "**/test-d/**"],
  "paths": [
    { "patterns": ["templates/**"], "packages": ["weapp-vite"] },
    { "patterns": ["docs/**"], "release": false }
  ],
  "links": [
    { "from": ["weapp-vite", "wevu"], "to": ["create-weapp-vite"], "level": "patch" },
    { "from": ["@weapp-vite/constants"], "dependents": true, "dependencyFields": ["dependencies", "optionalDependencies"], "level": "patch" }
  ],
  "titleTypes": { "feat": "minor", "fix": "patch", "deps": "patch" },
  "breakingRequiresLabel": true,
  "summary": { "language": "zh-CN", "template": "变更：{title}（#{number}）" }
}
```

Path rules use the first matching rule. Package selections and links accept package-name globs; links propagate until stable. `{title}`, `{number}`, `{packages}` and `{level}` are supported summary substitutions; `summary.byType` supplies templates for individual conventional commit types. Private packages can participate in relationships but do not receive published change intents.

```bash
repo release auto-changeset --repository owner/repository --pr 123 --json
repo release auto-changeset --workflow --out .github/workflows/repoctl-auto-changeset.yml
```

`createAutoChangesetPlan(options)` reads GitHub metadata, discovers packages using the actual `pnpm-workspace.yaml` globs, and returns a schema-versioned proposal. Nested directories, excluded packages and dependency aliases are supported. It reads policy from an immutable default-branch revision and never evaluates candidate `repoctl.config`, scripts or pnpmfile. Trusted API callers can provide a validated `policy` object explicitly.

`getAutoChangesetWorkflow(options)` exports a pinned, checkout-free workflow. Merge the policy and workflow into the default branch, create its `release-intent-write` environment with required reviewers and administrator bypass disabled, and dispatch the workflow for a selected same-repository PR. The read-only plan job freezes the PR head/base, policy, title, labels and Actions attempt. The protected apply job recomputes the proposal after approval and invokes `applyAutoChangeset({ ...options, expected: plan.revision })`. The CLI equivalent is `--apply --expected <plan.json>` and requires that same trusted workflow context. Settings include the workflow path/name, plan/apply job names, environment and policy path.

Application atomically appends a commit only when GitHub still reports the frozen head (`expectedHeadOid`). Truncated or inconsistent GitHub responses, moved refs, changed policy/title/labels, missing approval and reused attempts fail before updating the branch. Fork PRs are read-only. This opt-in workflow uses the built-in GitHub token; its commit does not automatically trigger another Actions run, so arrange normal validation of the new head through your repository's existing admission process.

Handwritten valid intents take priority. Generated `.changeset/auto-pr-<number>.md` files carry an ownership/checksum marker; edited or unowned files are protected. The checksum detects edits and is not an author signature. A later run removes an intact managed file when the change is withdrawn, a manual intent is added, or `release:none` is selected. Removed public packages need a handwritten intent or an explicit no-release decision. Repeating an unchanged proposal does not create another commit.

## Validate a formal Release PR

This validates the result of native `pnpm version -r`, independently of snapshot artifacts. Freeze full base/head commit IDs before running it:

```bash
repo release validate-preparation --base <full-base-sha> --head <full-head-sha> --branch main --json
repo release validate-preparation --base <full-base-sha> --head <full-head-sha> --policy .github/release-validation.json --json
```

The JSON policy is read from the frozen base Git blob. For example, `{ "branch": "main" }` selects the default stable line; `branches` uses the existing [release-line policy](/tasks/release). `--policy` and `--branch` are mutually exclusive. A release branch prefix can select this validation path, but only `status: "valid"` grants an exemption from the ordinary change-intent check. A failed validation must not fall back to accepting a deleted `.changeset` file as a new intent.

`validateReleasePreparation({ cwd, base, head, policy })` copies inert metadata into a disposable directory and replays native pnpm versioning. It checks manifests, consumed intents, ledger entries, changelog additions and dependency propagation, including fixed groups and prerelease lanes. It does not require every indirectly changed package to have a separate ledger entry or a version increment. It installs no dependencies and executes no candidate scripts, pnpmfile or release hooks. Use the same installed pnpm version as the preparation workflow. The checkout, index and Git refs remain untouched.

The schema-versioned report contains `status`, native `packages` with reasons and validation status, `files` with expected/missing/mismatched/unexpected outcomes, and structured errors. Extra source edits, historical changelog changes and unverified generated output fail. Native pnpm currently leaves the lockfile unchanged, so a changed lockfile does not qualify for this exemption.

Custom hook output needs a trusted `generatedFiles` contract with exact paths and SHA256 values. Trusted API callers may instead provide `validate(context)` callbacks over copied before/after bytes and the native package plan. No callback is imported from candidate code. These contracts cannot override checks for manifests, changelogs, intents, ledger, workspace configuration or lockfiles. When the output cannot be verified, reject the exemption and report the reason.

The package ships a small reusable recipe under `resources/release-validation/`. Pin actual published repoctl and pnpm versions that contain this API before enabling it. The source repository builds its validator from the frozen trusted base; consumer validation installs the base's locked tool dependencies with lifecycle scripts disabled. Both retain automatic consumer PR checks and require a valid report for release-like branches.

## Install native hooks safely

Use the public installer as the root `prepare` command, after installing `repoctl` and `lefthook` as development dependencies:

```json
{ "scripts": { "prepare": "repo tooling hooks install" } }
```

Make this command the installer by disabling Lefthook's own dependency lifecycle script in `pnpm-workspace.yaml`:

```yaml
allowBuilds:
  lefthook: false
```

For an older build allowlist, remove Lefthook from that list instead. Retain your repository's native `lefthook.yml`; the public entry point `installGitHooks(cwd, options?)` and `repo tooling hooks install --json` support ordinary checkouts, linked worktrees, repeated runs and CI skipping. A locally owned, recognized Husky setting can be migrated. Custom Husky hooks and custom local, included, global or system `core.hooksPath` settings remain protected. Removing a recognized local setting rechecks the effective Git configuration before installing, so it cannot overwrite a newly exposed user setting.

Add domain checks declaratively in `repoctl.config.ts`:

```ts
export default {
  tooling: {
    hooks: {
      preCommit: [
        { name: 'inventory', run: 'pnpm inventory:check', glob: '**/*.vue' },
        { name: 'skills', run: 'pnpm skills:check' },
        { name: 'project-json', run: 'pnpm project-json:fix', glob: '**/project*.json', stageFixed: true },
      ],
    },
  },
}
```

Checks become native Lefthook jobs before the final `pnpm exec repo verify staged-typecheck` job. Keep `pre-commit.piped: true`; incompatible native structure is rejected instead of rewritten. Lefthook owns partial-staging protection and `stage_fixed`. Omitting `preCommit` preserves existing jobs; `preCommit: []` removes only the `repoctl-domain:` jobs generated by this configuration. DOM inventory, skills and platform project checks remain repository commands.

Staged typechecking routes root tooling and package files to their nearest typecheck scripts, running every selected script once. A root tooling script does not suppress package checks, including when root and package TypeScript are staged together.

## Configure prepared snapshots

`snapshot publish-prepared --publisher-workflow` selects an existing trusted publisher filename. The [paired workflow exporter](/tasks/release#publish-a-prepared-pr-snapshot-from-a-separate-trusted-workflow) also accepts the protected environment, builder/publisher paths and names, and generates the matching trusted builder digest. Review and commit the generated pair; source publishing is not activated by installing repoctl.
