# Agent instructions

This workspace is managed by **repoctl**. The recommended command is `repo`.

Follow `AGENTS.md` in the workspace root. Create packages with
`pnpm exec repo new <name> --template <key>`. Verify with
`pnpm exec repo doctor` and `pnpm exec repo check`.

If you were asked to create a new business project, do not add it inside an
existing unrelated repository. Use a new or empty directory outside the repoctl
source checkout:

```bash
pnpm create repoctl@latest <dir> -- --yes --templates <keys>
cd <dir>
corepack enable
pnpm install
pnpm exec repo init
pnpm exec repo doctor
```
