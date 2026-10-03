# Dev Container preset

`repo tooling devcontainer` previews an optional development container for an existing pnpm workspace. It resolves the workspace root even from a package directory and does not start Docker or install anything during preview or application.

```bash
repo tooling devcontainer
repo tooling devcontainer --json --out ../devcontainer-plan.json
repo tooling devcontainer --apply ../devcontainer-plan.json
```

Review the JSON plan before applying it. Four files are proposed under the root `.devcontainer`: `devcontainer.json`, `Dockerfile`, `setup.mjs` and `README.md`. Existing custom files and an alternate root `.devcontainer.json` block application and are preserved. JSON contains per-file hashes and unified diffs; replaying a fully applied plan is a no-op. Input or target changes require a fresh preview. `--out` creates a new plan file and refuses to overwrite one.

The preset chooses the first pinned Node version compatible with root `engines.node`: `24.21.0`, then `22.23.3`. Use `--node-version <exact-version>` for another stable Node version at least `22.13.0` that satisfies the declared range. The requested `node:<version>-bookworm` image must exist when Docker starts; preview does not contact a registry. Root `packageManager` must pin a stable pnpm version, optionally with a Corepack integrity hash.

Open the generated workspace with the Dev Containers extension, or explicitly run the [Dev Containers CLI](https://github.com/devcontainers/cli). Container creation installs Corepack `0.36.0`, enables pnpm, checks its exact version and installs the workspace with engine enforcement. A present `pnpm-lock.yaml` is frozen; initial setup without a lockfile creates it. Corepack or installation failures stop setup.

Both the container and remote commands use the non-root `node` user. Dev Containers can adjust its UID to the host. The pnpm store uses a dedicated named volume outside the source checkout. When host and container platforms differ, use a separate checkout rather than sharing installed `node_modules` across platforms. Add needed application ports to `forwardPorts`, for example `[3000, 5173]`; the default forwards none. Start development services explicitly after setup.

Inside the container, run the generated project's `pnpm build`, `pnpm lint`, `pnpm typecheck`, `pnpm tsd`, `pnpm test` and `pnpm exec repo doctor`. Existing container files remain yours to maintain; generating a new plan after changing runtime requirements shows the proposed differences.

Programmatic APIs are `planDevContainer(cwd, { nodeVersion? })` and `applyDevContainerPlan(cwd, plan)`, exported from `repoctl`. Applying a plan uses the common file transaction with input checks and ownership-aware recovery. Container generation is independent of `repo init` presets.

If application is interrupted, inspect `.repoctl/devcontainer.lock` and `.repoctl-upgrade-*.tmp` files under `.devcontainer`. Ensure no writer is active and preserve concurrent edits while reconciling partial files. Then remove the stale lock and preview a fresh plan. Ordinary failures remove only files and empty directories owned by that application.

References: [Dev Containers configuration](https://containers.dev/implementors/json_reference/) and [official Node/TypeScript template](https://github.com/devcontainers/templates/tree/main/src/typescript-node).
