---
title: 第三方依赖准入
description: 离线检查第三方直接依赖的团队准入规则。
---

# 第三方依赖准入

`repo deps policy` 读取根包及私有工作区的依赖声明，执行显式 allow/deny 规则，不修改 manifest 或 lockfile。它不访问 registry，不检查传递依赖，也不推断许可证或漏洞。

```bash
pnpm exec repo deps policy
pnpm exec repo deps policy --json > dependency-policy.json
pnpm exec repo deps policy --json --baseline reviewed-policy.json
pnpm exec repo deps policy --strict
```

出现新增失败时退出码为 1；加上 `--strict` 后新增警告也返回 1。未提供基线时所有发现都视为新增。即使检查因违规返回非零，报告仍写入 stdout；配置或输入读取失败会报错，不会空白通过。

## 配置规则

```ts
import { defineMonorepoConfig } from 'repoctl'

export default defineMonorepoConfig({
  dependencyPolicy: {
    rules: [
      {
        id: 'browser-sdk',
        workspaces: ['apps/**'],
        dependencies: ['legacy-sdk', '@obsolete/*'],
        effect: 'deny',
        sections: ['dependencies', 'optionalDependencies'],
        reason: '浏览器应用统一使用仍在维护的 SDK',
        alternative: 'modern-sdk',
      },
    ],
    exceptions: [
      {
        rule: 'browser-sdk',
        workspace: 'apps/legacy-web',
        dependency: 'legacy-sdk',
        section: 'dependencies',
        reason: '负责团队正在迁移此应用',
        expiresOn: '2027-01-31',
      },
    ],
  },
})
```

工作区选择器支持完整包名、相对目录、`directory/**`、根目录 `.` 和全部工作区 `*`。未匹配的选择器会警告。依赖模式支持完整名称或 `@scope/*`。`sections` 必须显式选择 `dependencies`、`devDependencies`、`peerDependencies`、`optionalDependencies`。每条规则需要唯一 ASCII ID 和理由；`severity` 默认为 `fail`，可设为 `warn`。

同一工作区、同一分区的多条 allow 清单取并集。deny 同时匹配声明名称和 npm alias 的真实目标；allow 必须允许真实目标，不能通过替换 alias 名称绕过。显式 allow 与 deny 同时命中时产生 `admission-conflict`，规则顺序和例外都不能代替消除冲突。

检查先解析 pnpm 默认或命名 catalog，再解析 npm alias。参与规则的声明如果存在缺失或歧义 catalog、无效 alias，将产生 `admission-resolution`。显式 `workspace:` 以及精确指向工作区目录的 file/link 声明被归为内部依赖，列在 `skipped`。普通 semver 恰好匹配本地包时，无法仅凭声明确定实际安装来源；预期内部依赖应改用 `workspace:`。其他 file、Git、URL 依赖按声明名称检查，不读取外部内容。报告不包含原始版本字符串、URL 或其中的凭据。

首版读取 `package.json`，不支持或损坏的 manifest 会让检查失败。版本一致性分组 `commands.deps.groups` 与准入策略独立，不改变本项规则。

## 例外与 CI 基线

例外必须指定精确规则 ID、相对工作区目录、依赖声明键、分区和理由。一条 allow 清单的有效例外会显式允许该声明。到期日期按 UTC 当日结束计算，提前七天警告；过期后恢复拦截。失效的闲置例外会警告，实际使用的例外和理由保留在报告中。

先审核或提交完整 `--json` 报告，再将它用作 `--baseline`。基线必须匹配当前策略指纹；修改规则或例外后需要重新审核基线。缺失、格式错误、重复发现或不兼容的基线都会失败。`--full` 显式忽略基线并全量检查。已有问题仍显示为 `baseline: "existing"`，退出码及 `summary.fail`/`warn` 只统计新增问题。基线是人工审核的数据文件，不是签名，也不能直接信任未经审核的 PR 产物。

JSON 使用 `schemaVersion: 1`、`kind: "dependency-admission"`、稳定规则 ID、声明位置及策略 hash，不随 CLI 语言变化。发现保留规则理由和替代建议。只有配置了 `dependencyPolicy`，`repo doctor` 才执行全量准入检查；doctor 不会隐式读取基线。

公共 API 为 `checkDependencyAdmission(cwd, { config?, baseline?, full?, now? })`，返回 `DependencyAdmissionReport`。`now` 允许集成方传入可确定的时钟。类型导出包括 `DependencyAdmissionConfig`、`DependencyAdmissionRule` 和 `DependencyAdmissionException`。
