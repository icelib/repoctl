---
"@icebreakers/changelog-github": patch
"@icebreakers/commitlint-config": patch
"create-icebreaker": patch
"create-repoctl": patch
"@icebreakers/eslint-config": patch
"eslint-plugin-better-stylelint": patch
"lightningcss-tailwindcss": patch
"@icebreakers/monorepo": patch
"@icebreakers/monorepo-templates": patch
"postcss-tailwindcss": patch
"repoctl": patch
"@icebreakers/stylelint-config": patch
"stylelint-plugin-tailwindcss": patch
---

Move canonical documentation links and package homepages to repo.icebreaker.top; separate stable documentation from the unreleased preview site.

Check catalog dependency values against each package's published source before stable documentation deployment, including build dependencies, while allowing changes to unrelated catalog entries.

Resolve documentation sites from the upgrade target when using `upgrade --out-dir`, so the destination does not inherit documentation deployment workflows from the calling directory's configuration.
