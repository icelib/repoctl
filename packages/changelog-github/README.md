# @icebreakers/changelog-github

- [简体中文指南](./README.zh.md)

## Overview

`@icebreakers/changelog-github` is a drop-in replacement for `@changesets/changelog-github` that keeps the familiar tuple signature while adding repo-aware formatting tweaks we rely on across Icebreaker workspaces. It renders richer metadata, supports custom summary hints, and boots with dotenv so local CLI runs behave the same as CI.

## Requirements

- Node.js 22.13 or newer
- A GitHub token exposed via `GITHUB_TOKEN`, `GH_TOKEN`, or `.env`

## Installation

```bash
pnpm add -D @changesets/cli @icebreakers/changelog-github
```

## Quick Start

Point the Changesets config at the Icebreaker formatter and declare your repository slug:

`org/repo` is a placeholder; replace it with the GitHub repository that consumes this formatter.

```json
{
  "changelog": [
    "@icebreakers/changelog-github",
    { "repo": "org/repo" }
  ]
}
```

Run `pnpm changeset` as usual—generated changelogs will now use the enhanced formatter.

## Key Differences from `@changesets/changelog-github`

- **Summary tags** – recognises leading `pr:`, `commit:`, and `author:` / `user:` directives (case-insensitive) to override GitHub metadata while keeping the rest of the summary intact.
- **Short commit links** – when you supply a `commit:` tag, the formatter renders the shortened SHA as a hyperlink (and shows it alongside the PR link when both are provided).
- **Optimized formatting** – uses a clean, multi-line layout with essential metadata only. Removes redundant separators and labels for better readability on GitHub.
- **Dotenv bootstrapping** – automatically loads `.env` before hitting the GitHub API, matching local development to CI without extra wiring.
- **Dependency section** – lists dependency bumps with consistent Markdown indentation and links any backing commits for extra context.

All other behaviours (tuple arguments, required `repo` option, rendered layout) remain compatible with the upstream formatter, so migrating simply switches the package name.

## Writing Changeset Summaries

Leverage the summary tags to control the metadata the formatter displays:

```text
pr: #42
commit: 1234567890abcdef1234567890abcdef12345678
author: @octocat

Add optional `tailwind-config` flag to the lint preset

- accepts a relative path to `tailwind.config.ts`
- falls back to the workspace root when unset
```

The rendered changelog entry becomes:

```md
- ✨ **Add optional `tailwind-config` flag** [#42] [`1234567`](https://github.com/org/repo/commit/1234567890abcdef1234567890abcdef12345678) by @octocat
  - accepts a relative path to `tailwind.config.ts`
  - falls back to the workspace root when unset
```

## GitHub Authentication

Set `GITHUB_TOKEN` (or `GH_TOKEN`) with a token that can read public repo metadata. During local development you can store it in `.env`; the formatter calls `dotenv/config` automatically, so no extra setup is required.

## Troubleshooting

- **Missing repo error** – ensure the tuple includes your `org/repo` string; the formatter throws early when it is absent.
- **Empty metadata** – verify the GitHub token is available to the process and that the commit/PR exists in the target repo.
- **Summary tags ignored** – tags must appear at the top of the summary, each on its own line, before the main description content.

## Project links

- Documentation: https://repoctl.icebreaker.top
- Repository: https://github.com/icelib/repoctl/tree/main/packages/changelog-github
- Issues: https://github.com/icelib/repoctl/issues
