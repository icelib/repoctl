# 安装安全策略

`repo doctor security` 只读检查 pnpm 的持久配置和当前进程环境，不安装依赖、不批准构建、不执行生命周期脚本或 pnpmfile。报告覆盖版本冷却、信任降级、构建决策和版本兼容性；`repo doctor` 也包含同样的检查。

```sh
repo doctor security --json
repo doctor security --pnpm-version 10.26.0 --json
repo doctor security --expectations policy.json --strict --json
repo doctor security --preset balanced > install-policy-plan.json
repo doctor security --apply install-policy-plan.json
```

检查版本按显式精确版本、实际启动器元数据、根包 `packageManager` 的顺序确定。仅有声明证据时发出警告；未知、预发布和暂不支持的新版本不猜测默认值。`--pnpm-version` 只切换审计语义，不激活该版本；应用计划时必须与当前解析出的 pnpm 版本一致。

报告标明配置来源及版本边界。新版 pnpm 读取全局 `config.yaml`、项目 `pnpm-workspace.yaml` 和 `PNPM_CONFIG_` 环境设置；旧 npmrc 策略及 package.json.pnpm 声明会提示不生效。旧版多个来源相互冲突、配置依赖、逐包配置都会显示未知结果。其他 pnpm 调用的临时 CLI 参数无法观测；外部 `onlyBuiltDependenciesFile` 不会读取；配置中的环境插值不会展开。

JSON 的 `schemaVersion: 1` 包含 `kind`、`workspaceDir`、`pnpm`、`settings`、`builds`、`checks`、`summary`、`limitations`。字段、状态及规则 ID 与语言无关。无效值不会回显，registry 凭据、完整配置内容和 Git 构件 URL 不进入报告；策略数组仅显示包名，构建选择器仅保留类别。例外理由是用户填写的报告文本，不应包含密钥。

构建决策分别保留允许、拒绝和待审核声明，`builds.override` 单独解释全局脚本设置；相互冲突的 allow-all 与包决策得到未知结果。`pendingPackages` 表示安装后尚未构建的包，不等于未经批准。`ignoreScripts` 不会禁用 pnpmfile。查看报告不会批准任何依赖。

## 组织期望

在 `repoctl.config.ts` 使用 `installationSecurity`，或者通过独立 JSON 文件传入相同对象：

```ts
export default {
  installationSecurity: {
    minimumReleaseAge: 1440,
    trustPolicy: 'no-downgrade',
    requireBuildApproval: true,
    severity: 'warn',
    exceptions: [
      { key: 'minimumReleaseAgeExclude', package: '@acme/internal', reason: '由内部发布流水线交付' },
    ],
  },
}
```

期望只比较当前策略，不修改配置。冷却期检查包括关闭等待、非严格回退和缺失时间旁路；信任检查包括可信锁文件、时间截断，以及缺失时间旁路开始影响信任的 pnpm 版本。例外必须精确匹配 pnpm 选择器并填写非空理由；缺少理由和未使用的理由都会显示。`--strict` 令警告返回失败；`severity: 'fail'` 将期望不符直接设为失败。未知字段、非法配置和 null 值会被拒绝。

稳定规则 ID：`install-security-version`、`install-security-release-age`、`install-security-trust`、`install-security-builds`、`install-security-compatibility`、`install-security-config`、`install-security-expectation`、`install-security-exception`。

## 可选追加预设

`balanced` 仅为缺失且版本支持的设置提供建议：1440 分钟冷却、严格冷却、禁止缺失时间旁路、禁止信任降级、空的构建批准表、关闭 allow-all 和严格依赖构建。项目、全局和环境中已有的显式设置都会保留，包括冷却值 0。不会混用旧批准列表和新 map；已有 allow-all 时不追加不兼容的批准表。预设是起点，不会覆盖或保证已有策略。

预览只读，包含新增键、保留键、diff 和哈希，不包含完整 YAML。应用时重新生成同一计划，核对工作区、pnpm 版本和输入哈希，拒绝链接文件和过期计划，再通过备份和原子替换写入。注释与无关字节保持原样，完整执行后重跑不写入。替换前失败保留当前文件，可恢复错误自动回滚；清理备份失败明确提示变更已应用并列出备份路径。核查后再删除这些文件；手动恢复后重新预览。

公开 API 为 `inspectInstallSecurity`、`planInstallSecurityPreset`、`applyInstallSecurityPreset` 及导出的报告、计划、选项类型。子命令不能混用父 doctor 的 `--markdown`、`--out`、`--redact`；请明确使用本命令 JSON 输出。

参考：[pnpm 依赖解析](https://pnpm.io/settings/dependency-resolution)、[依赖构建](https://pnpm.io/settings/build)、[配置来源](https://pnpm.io/configuring)、[pnpm 10 设置](https://pnpm.io/10.x/settings)。
