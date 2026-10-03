# 公共 API 基线

`repoctl package api check` 只读比较已构建的 TypeScript 声明和显式声明的 API Extractor 基线。只对 `tooling.apiReports` 中登记的库生效，未配置的包显示 skipped。命令不安装工具、不运行构建、不发布，也不推断完整 SemVer 结论。

先在工作区安装兼容的 `@microsoft/api-extractor`（稳定版本 `>=7.52.12 <8`）并构建库。repoctl 调用消费项目的本地工具，在临时目录生成原生 API 报告；不会把现有基线交给工具覆盖。生成结束或失败后清理临时目录。

```ts
export default {
  tooling: {
    apiReports: {
      '@team/sdk': {
        entries: {
          '.': { entryPoint: 'dist/index.d.ts', baseline: 'etc/sdk.api.md' },
          './feature': { entryPoint: 'dist/feature.d.ts', baseline: 'etc/sdk-feature.api.md' },
        },
        tsconfig: 'tsconfig.json',
      },
    },
  },
}
```

`entryPoint` 和 `tsconfig` 相对于包目录，`baseline` 相对于工作区根目录。入口必须是 manifest 中可验证的显式公开入口，支持 `.d.ts`、`.d.mts`、`.d.cts`；通配 exports 需要先明确入口映射，数组回退和版本化 `types@` 条件暂不自动解析。只读取构建声明，不从源码推断导出。所有基线必须是独立 `.api.md` 文件，拒绝路径穿越、链接、受保护目录及非原生报告内容。

```sh
repoctl package api check --package @team/sdk
repoctl package api check --json
repoctl package api update --json > api-plan.json
# 审核计划中的签名 diff、诊断与 change intent 链接后：
repoctl package api update --apply api-plan.json
```

`check` 发现新增/变更或分析失败时退出 1；未配置或一致时退出 0。`update` 默认仅预览，分析失败时退出 1。`--apply` 重新分析并验证包选择、配置、工具、编译输入和基线，拒绝陈旧计划与部分应用状态。更新使用带操作锁的多文件事务；正常重跑不产生额外 diff，失败时回滚，存在并发编辑则保留恢复文件并明确报错。不会改写无变化的 CRLF 基线。

报告包含实际新增、删除和签名 diff、原生诊断，以及该包尚未消费的 change intents。没有 intent 时提醒人工审核，已有 intent 也不代表版本策略已经正确。运行行为变化、平台兼容、文档语义和 SemVer 仍需审核。

程序接口为 `checkPublicApi(cwd, options)`、`planPublicApiUpdate(cwd, options)`、`applyPublicApiUpdate(cwd, plan, options)`，以及 `formatPublicApiReport(report)`。报告/计划带 `schemaVersion: 1`，状态与诊断 ID 使用固定英文。API 支持 `AbortSignal` 和 1–600000 毫秒的原生进程超时；默认 120000 毫秒。报告过大时 diff 可为 null，完整前后签名仍包含于 JSON 中。

原生工具的配置由 repoctl 构造以保证报告临时输出隔离；不会加载任意 API Extractor 输出配置。TypeScript 配置和原生 TSDoc 语义保持工具行为。参照：[API Extractor API report](https://api-extractor.com/pages/setup/configure_api_report/)。
