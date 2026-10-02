---
title: 闲置代码与依赖检查
description: 显式运行原生 Knip，并使用审阅后的基线逐步治理。
---

# 闲置代码与依赖检查

`repo check knip` 调用工作区根目录已安装的 [Knip](https://knip.dev/)，报告闲置文件、导出、依赖，以及缺少声明的导入。这是显式启用的可选检查，普通 `repo check`、staged、full 和 affected 模式保留原有行为。

```bash
pnpm add -Dw knip@^6.39.0
pnpm exec repo check knip --recommend-config
pnpm exec repo check knip --dry-run --json
pnpm exec repo check knip --json
pnpm exec repo check knip --config knip.config.ts --strict
```

支持 `>=6.39.0 <7`。repoctl 不下载 Knip、不回退到父目录或全局安装、不将其作为运行时依赖，不运行 `--fix`，也不删除代码。工具缺失或版本不支持时，输出安装指引并失败。此命令关闭 Jiti 磁盘缓存。原生配置及插件仍按 Knip 自身的方式执行，因此应使用可信的仓库配置。

## 原生配置

`--recommend-config` 输出供人工合并的 JSON 建议，列出现有配置，不覆盖或写入它们。建议包含 pnpm workspace、库和 CLI 入口、根目录工具脚本、类型测试，以及构建、覆盖率、框架缓存和 Worker 类型等生成文件的显式排除规则。

项目的 [Knip 原生配置](https://knip.dev/reference/configuration) 与框架插件仍是分析依据。若插件无法推断动态加载或约定式入口，使用 `entry` 显式声明。通过原生 `ignoreFiles`、`ignoreIssues` 审阅并排除示例或 fixture；不会默认豁免所有示例。`"exports": "warn"` 等规则保留原生严重级别。

`--production` 使用 Knip 的 production 分析范围；`--strict` 同时启用 production 范围，并按工作区检查直接依赖声明，避免根目录声明掩盖子包缺失声明。加入 CI 前应先检查原生 production 入口范围。

JSON 报告包含工作区、文件、可用的源码位置、分类、原生诊断信息与 `warn`/`error` 严重级别。配置和标签提示也保留各自级别。退出码如下：

| 状态码 | 含义                                          |
| ------ | --------------------------------------------- |
| `0`    | 所选策略通过，警告及基线已有问题仍显示。      |
| `1`    | error 问题阻断所选策略。                      |
| `2`    | 分析不完整、本地工具缺失/不支持，或基线无效。 |

**`check knip`** 的 `--json` 输出实际分析结果，另加 `--dry-run` 才是工具命令预览。这两个共享选项可放在 `knip` 前后，其他 Knip 参数放在子命令后面，不能混用父级 `check` 执行模式或选项。`--timeout <ms>` 默认 120000 毫秒。

## 审阅后的基线

```bash
# 审阅现有问题后，显式创建或更新基线。
pnpm exec repo check knip --save-baseline knip-baseline.json --json
# CI 仅阻断新增 error；仍列出已有、新增和已修复问题。
pnpm exec repo check knip --baseline knip-baseline.json --new-only --json
```

保存不会隐藏本次问题的退出码：基线可能成功写入，但命令仍以 `1` 退出。普通分析不会更新基线。`--save-baseline` 不能与比较、new-only、dry-run 或配置建议选项混用。未加 `--new-only` 时，比较仍阻断全部当前 error。

问题身份包含分类、严重级别、工作区、文件和符号；仅行号变化不会被当作新增问题，严重级别升级会视为新增。基线绑定 Knip 精确版本、production/strict 模式、根包名称、原生工作区集合、主要配置摘要、报告分类和启用插件。缺失、格式错误、重复、篡改或范围不兼容的基线均失败，即使当前没有 error 也不会放行。

主要配置包含选中的文件、发现的标准 Knip 文件、根 `package.json#knip` 和 pnpm workspace 包模式。修改源码、修复依赖不会令基线失效。导入的配置辅助模块、环境变量驱动的行为，以及各插件的所有辅助配置无法完整指纹化；改变这些分析策略后，需要审阅并显式重新生成基线。

基线输出必须位于工作区内，父目录须已存在且没有链接。已有目标必须是有效基线，不能覆盖其他配置或普通文件。新文件以独占方式创建；更新先暂存并检查并发变化，文件系统失败保留原基线。中断或清理失败时，先检查报告中保留的 `.repoctl-knip-*.tmp` 路径，再重试。

公开 API 为 `planKnipCheck(cwd, options)`、`runKnipCheck(cwd, options)`、`getKnipConfigurationSuggestions(cwd)` 和 `saveKnipBaseline(cwd, report, file)`。支持 `timeoutMs` 与 `AbortSignal`，不完整或被中断的分析不能保存。config 路径相对 `cwd`，baseline 路径相对工作区根目录，从子包执行时也一致。
