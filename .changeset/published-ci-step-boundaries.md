---
"@icebreakers/monorepo-templates": patch
---

发布模板时按 YAML 结构移除源码仓库专用 CI 步骤，避免相邻步骤、额外字段或多行命令漏删；复用源码专用脚本分类，防止生成项目调用不存在的打包检查。
