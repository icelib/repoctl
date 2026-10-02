# 组织工程预设

组织预设是包含 `repoctl.preset.json` 的普通 npm 包，用于在独立仓库之间共享配置、模板、能力建议和少量有明确归属的工程文件。

先显式安装，并在工作区根 `package.json` 中保存精确版本：

```bash
pnpm add -Dw --save-exact @acme/repoctl-preset@1.2.3
```

```ts
import { defineMonorepoConfig } from 'repoctl'

export default defineMonorepoConfig({
  presets: [{ packageName: '@acme/repoctl-preset', version: '1.2.3' }],
  commands: { clean: { includePrivate: false } },
})
```

引用、依赖声明和已安装包的名称及版本必须一致，不接受版本范围或 tag。加载仅读取已安装的 JSON，不导入包入口、不执行包脚本、不安装依赖、不下载模板、不写缓存。

## 包契约

发布包的 `files` 应包含清单及引用的资产：

```json
{
  "schemaVersion": 1,
  "requires": { "repoctl": ">=5.6.0 <6" },
  "config": {
    "commands": {
      "clean": { "includePrivate": true },
      "release": { "qualityScripts": ["build", "lint", "test"] }
    }
  },
  "templates": {
    "acme-sdk": {
      "source": "templates/sdk",
      "target": "packages/sdk",
      "category": "library",
      "label": "Acme SDK"
    }
  },
  "capabilities": [{ "id": "playwright", "reason": "浏览器交互检查" }],
  "assets": [{ "source": "assets/check.mjs", "target": "scripts/acme-check.mjs" }]
}
```

可选 `extends` 使用同样的精确 `{ packageName, version }` 引用。父预设还需在预设包的 `dependencies` 或 `devDependencies` 中精确声明并已安装；发布包必需的父预设应放入 `dependencies`。加载顺序为依赖预设、声明它的预设、后续顶层预设、原有 C12 项目配置、显式 CLI 参数。预设边界的对象按字段合并，数组整体替换；项目配置内部保留 C12 原有语义。预设 `config` 不接受 C12 元数据、其他 `presets`、`templatesDir` 或 `templateMap`，应使用清单的 `extends` 和 `templates`。

相同引用重复出现时给出诊断并只应用一次。循环引用、同包不同版本、不兼容的 `requires.repoctl`、未知配置、危险资产路径和不支持的能力 ID 会阻止消费命令。最多解析 64 个包、16 层依赖。

```bash
repo presets inspect --json
repo config inspect --json
repo config inspect --command clean --set 'includePrivate=false' --json
repo templates --json
```

配置检查包含有序 `layers` 和逐字段 `sources`，标明包名及版本；`effective.sources` 还说明命令默认值与 CLI 覆盖。既有 `effective.origins` 保持 `default | project | cli`，其中预设继续归入 project，兼容现有消费者。配置报告的脱敏规则覆盖每一层。

模板按预设顺序进入统一目录，项目模板声明优先。每个模板使用声明它的预设包的精确 npm 身份。`templates` 与 `config inspect` 仅检查声明；用 `repo templates fetch acme-sdk` 准备经过完整性验证的模板内容，实际创建也可以准备缓存。创建预览和 `--offline` 创建要求已有验证通过的缓存。registry 配置与完整性检查遵循[远程模板来源契约](./templates.md)，不会把已安装配置包直接当作验证过的远程模板缓存。

能力清单仅为建议。加载预设或应用工程文件不会安装、应用能力；审阅后使用显式 `repo tooling` 能力工作流。

## 受管工程文件

```bash
repo presets plan --json --out preset-plan.json
repo presets apply preset-plan.json --json
```

计划默认只读，`--out` 只创建新的审阅文件。计划包含包身份、输入指纹、准确变更、diff 和归属记录。应用需显式执行，输入变化或计划被篡改会被拒绝，重复应用已完成计划不产生变更。将 `.repoctl/baselines/presets` 与受管文件一起提交。

允许的目标包括受支持的根工具配置、GitHub 工作流及 issue 模板、指定 VS Code 配置和工程脚本；不能声明业务代码、依赖清单或 repoctl 内部元数据。拒绝包内符号链接、路径穿越和不兼容平台的文件名。新预设不能认领已有文件，即使内容相同，也不能接管其他预设或 repoctl 的 baseline。多个已启用预设争用同一路径时，整个计划被阻止。已有归属时请选择新目标；首版不自动转移所有权。

升级时显式安装新精确版本、更新引用，再审阅新计划。上一版上游 baseline 用于三方合并：不重叠的本地修改会保留，重叠修改或本地删除会阻止写入。清单不再声明的文件及其归属记录继续保留，删除和归属转移需要单独人工审阅。

工作区锁覆盖校验、暂存、写入和回滚，受管文件写入后才推进 baseline。失败会恢复原始字节；并发编辑及恢复备份会被保留，不会被回滚覆盖。进程中断后，请保留 `.repoctl-upgrade-*.bak`/`.tmp`，确认没有活跃写入进程，按报错核对备份和 baseline 后，再移除遗留 `.repoctl/upgrade.lock` 并重新生成计划。

公共 API 为 `resolveOrganizationPresets(cwd, references)`、`planOrganizationPresetAssets(cwd)` 和 `applyOrganizationPresetAssets(plan)`。解析器返回结构化预设诊断；读取配置的 API 会在写入前将阻断诊断映射为配置校验失败。
