---
"@icebreakers/monorepo": patch
"repoctl": patch
"@icebreakers/monorepo-templates": patch
---

统一根包与私有包的发布 intent 识别和版本预览边界，仅对可发布包校验发布说明；通过已提交账本与第一父提交历史定位首次发布来源，并严格校验恢复时 changelog 的存在性。
