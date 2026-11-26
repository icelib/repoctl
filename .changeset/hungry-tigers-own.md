---
"@icebreakers/commitlint-config": patch
"@icebreakers/eslint-config": patch
"@icebreakers/monorepo": patch
"repoctl": patch
"@icebreakers/stylelint-config": patch
"stylelint-plugin-tailwindcss": patch
---

放宽 repoctl 运行时依赖闭包中的 peer 版本约束，减少宿主项目安装时的版本冲突。
