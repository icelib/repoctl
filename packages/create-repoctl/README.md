# create-repoctl

English | [简体中文](README.zh-CN.md)

The recommended create command for starting a repoctl-managed pnpm and Turborepo workspace.

```bash
npm create repoctl@latest
pnpm create repoctl@latest
yarn create repoctl@latest
```

The interactive flow selects a target directory and any built-in templates to include. After creation, or for agents that must not prompt:

```bash
pnpm create repoctl@latest my-app -- --yes --templates vue-hono
npm create repoctl@latest my-app -- --yes --templates vue-hono
npx create-repoctl@latest my-app --yes --templates vue-hono
```

Template keys: `vue-hono`, `hono-server`, `tsdown`, `vue-lib`, `vitepress`, `cli`. After creation:

```bash
cd <project>
corepack enable
pnpm install
pnpm exec repo init
pnpm exec repo doctor
pnpm exec repo check
```

## For AI agents

Run the command from a new or empty directory outside the repoctl source
checkout. If the user asked you to create a project with repoctl, run the
`--yes` command above, then `corepack enable`, `pnpm install`, `pnpm exec repo
init`, and `pnpm exec repo doctor`. Do not wait for interactive prompts.

Output is English by default. Pass `--lang zh-CN` or set `REPOCTL_LANG=zh-CN` for Simplified Chinese.

```bash
pnpm create repoctl@latest -- --lang zh-CN
```

## Project links

- Documentation: https://repoctl.icebreaker.top
- Repository: https://github.com/icelib/repoctl/tree/main/packages/create-repoctl
- Issues: https://github.com/icelib/repoctl/issues
