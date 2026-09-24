# create-icebreaker

English | [简体中文](README.zh-CN.md)

Compatibility create command for repoctl-managed workspaces.

Existing automation may continue to use:

```bash
npm create icebreaker@latest
pnpm create icebreaker
```

New projects should prefer `npm create repoctl@latest` or `pnpm create repoctl@latest`. Run the command in a new or empty directory outside the repoctl source checkout. Both entrypoints use the same maintained scaffold engine and lead into the `repo init`, `repo doctor`, `repo new`, and `repo check` workflow. After entering the generated project, run `corepack enable` before installing dependencies.

Output is English by default. Pass `--lang zh-CN` or set `REPOCTL_LANG=zh-CN` for Simplified Chinese.

## Project links

- Documentation: https://repoctl.icebreaker.top
- Repository: https://github.com/icelib/repoctl/tree/main/packages/create-icebreaker
- Issues: https://github.com/icelib/repoctl/issues
