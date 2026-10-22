---
outline: deep
---

# AI Entrypoint: llms.txt

The documentation build generates `/llms.txt` and `/llms-full.txt`. English is the default corpus; Chinese pages are clearly namespaced under `/zh/`.

## Usage

```text
https://repo.icebreaker.top/llms.txt
https://repo.icebreaker.top/llms-full.txt
```

Use the compact index for discovery and the full file only when the consumer has enough context budget.

## Scope

The generated index includes current product guides, package roles, commands, reports, template assets, knowledge pages, and tool topics. Historical changelogs, example fixture READMEs, generated build output, and internal maintenance files are excluded.

## Language

English URLs use the site root. Simplified Chinese pages use `/zh/`; this mirrors the CLI default and `--lang zh-CN` opt-in behavior.
