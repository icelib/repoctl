---
"@icebreakers/monorepo": major
"repoctl": major
"@icebreakers/monorepo-templates": major
"@icebreakers/eslint-config": patch
"@icebreakers/commitlint-config": patch
---

Replace Husky and lint-staged with native Lefthook jobs in source and generated workspaces. Remove the Husky/lint-staged tooling fields, exported types and configuration factories, and replace the lint-staged init target with lefthook. Default hook upgrades migrate configuration, dependencies and installation scripts together; custom hooks require manual migration. Failed checks block commits while retaining completed fixes and protecting unstaged changes.
