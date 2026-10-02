# Templates

Prefer `repo new [name]` for the guided flow. For agents, pass `--template`
explicitly so the command does not prompt.

Intent defaults:

- library -> `tsdown` -> `packages/<name>`
- web-app -> `vue-hono` -> `apps/<name>`
- api-service -> `hono-server` -> `apps/<name>`
- docs-site -> `nimbus` -> `apps/<name>`
- cli-tool -> `cli` -> `apps/<name>`

Run `repo templates` to discover template keys, categories, default targets, and
descriptions. Use `repo templates <key>` for a single template detail page, and
`repo templates --json` when scripting. Use `repo templates --check` to verify
template metadata, directories, package.json files, duplicate targets, and
temporary files; combine it with `--json` for CI. Use `repo templates --markdown`
or `repo templates <key> --markdown` when generating documentation snippets.
Add `--out <file>` to write the selected output to disk.

Use `repo new <name> --template <key> --dry-run` to preview the target directory
and package metadata without writing files. Use `repo new <name> --template <key>
--json` when a script needs the same create plan as structured data; `--json`
implies `--dry-run`. Add `--out <file>` to write either preview format to disk.

Explicit template keys are validated before any files are written. If a key is
misspelled, the CLI fails and prints the closest known key when one is available.

Advanced users can still use `repo package create [path]` or `repo pkg new [path]`
to select templates directly.

Built-in template map:

- tsdown -> templates/tsdown => packages/tsdown
- vue-lib -> templates/vue-lib => packages/vue-lib
- hono-server -> templates/server => apps/server
- vue-hono -> templates/client => apps/client
- next -> templates/next => apps/next (Next.js App Router, server page, client state and health route)
- nimbus -> templates/nimbus => apps/docs (default documentation template)
- vitepress -> templates/vitepress => apps/website (explicit alternative)
- cli -> templates/cli => apps/cli

Notes:

- The command prompts for template selection unless defaults are set in
  repoctl.config.ts or monorepo.config.ts.
- Override mappings with `commands.create.templateMap` and `commands.create.templatesDir`.

For `next`, run `typecheck` to generate Next route types before `tsc`. Its local Turbo config caches production output and excludes `.next/cache`. Compiled workspace libraries use public package exports and `^build`; source-exporting libraries must be named in `transpilePackages`. Never copy `.next`, `next-env.d.ts` or an independent pnpm lockfile into the template.
