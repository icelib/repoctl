# Lefthook

Lefthook manages Git hooks and staged file tasks through the repository's `lefthook.yml`. repoctl defaults to Lefthook 2.2.2, including its protection for partially staged files.

## Install hooks

Run `pnpm install` after cloning. `pnpm-workspace.yaml` enables `allowBuilds.lefthook: true`, so Lefthook's postinstall installs the hooks. There is no Husky `prepare` script. CI skips automatic installation; release workflows use `LEFTHOOK=0` to skip hook execution.

To install explicitly after changing Git configuration or restoring cached dependencies, run:

```bash
pnpm exec lefthook install
pnpm exec repo doctor
```

`repo init --tooling lefthook` writes the native configuration and adds the dependency and build approval. The standard init preset also creates the ESLint, Stylelint, commitlint and TypeScript configurations that these hooks use.

Existing workspaces using `onlyBuiltDependencies` keep that permission format for older pnpm versions; Lefthook is added to the allowlist. Explicit postinstall denials are preserved and require manual hook installation.

## Default verification

| Hook       | Tasks, in execution order                                                                                              |
| ---------- | ---------------------------------------------------------------------------------------------------------------------- |
| pre-commit | ESLint fixes staged code and documents; Stylelint fixes staged styles and Vue SFCs; repoctl checks affected workspaces |
| commit-msg | `pnpm exec repo verify commit-msg "{1}"`                                                                               |
| pre-push   | `pnpm lint`, then `pnpm typecheck`                                                                                     |

The pre-commit pipeline is sequential and stops on failure. ESLint and Stylelint both edit Vue files, so they must not run concurrently. Both jobs set `stage_fixed: true`. `glob_matcher: doublestar` makes the file patterns include both root files and nested files.

The final pre-commit job calls `repo verify staged-typecheck` once without file arguments. repoctl reads staged filenames using Git's NUL-delimited output, excludes deletions, finds the owning workspaces and runs each workspace's `typecheck` once. A root-level change uses the root typecheck instead of repeating child checks. Vue workspaces use `vue-tsc`; other TypeScript workspaces use `tsc` through their scripts.

You can also pass explicit files:

```bash
pnpm exec repo verify staged-typecheck packages/ui/src/button.ts
pnpm exec repo verify pre-commit
```

The `pre-commit` wrapper calls Lefthook. Do not put `repo verify pre-commit` inside `lefthook.yml`, because that would recursively invoke the hook. `repo verify pre-push` remains available as a separate, stronger check that also selects build, test and tsd tasks from the push range.

## Partial staging and failures

Lefthook hides unstaged changes in partially staged files while pre-commit runs, then restores them. Successful fixes are staged automatically. A failed task blocks the commit and may leave completed fixes in the index or working tree. This differs from lint-staged's default rollback behavior. Review `git diff` and `git diff --cached` before retrying. A restoration conflict also blocks the commit; resolve it without discarding your original changes.

## Migrate existing projects

Run `repo upgrade --yes` to migrate the recognized default Husky/lint-staged setup as one unit, then run `pnpm install` and `pnpm exec lefthook install`. `--no-overwrite` and `skipOverwrite` preserve the entire old setup. Custom hooks, custom staged-file configuration and custom installation scripts are preserved with a manual migration warning. Their package and workspace manifests are also preserved so the installed CLI continues to support the old hook APIs until you migrate them.

For a custom setup, translate its commands to native Lefthook jobs first. Remove Husky and lint-staged dependencies, their configuration files and a default `prepare: husky` script after checking the new jobs. If the **local** `core.hooksPath` still points to `.husky` or `.husky/_`, remove that local setting before installing Lefthook. repoctl never resets global Git settings or an unrelated custom hook path.

The old `tooling.husky` and `tooling.lintStaged` fields, `HuskyToolingConfig`, `LintStagedToolingConfig`, `MonorepoLintStagedConfig`, `MonorepoLintStagedConfigOptions`, `createMonorepoLintStagedConfig()` and `defineLintStagedConfig()` have been removed. Configure commands, filters and exclusions directly in `lefthook.yml`. Replace `HUSKY=0` with `LEFTHOOK=0` in automation.
