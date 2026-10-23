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

Require patched Node.js releases (^22.23.4 || ^24.22.1 || >=26.12.1) following the October 2026 security release. Use Node 24.22.1 LTS by default in generated workflows and containers, and validate all supported runtime lines.

Refresh non-major tooling and template dependencies, including Astro 7.4.0, and align generated project requirements with its Node.js minimum.
