import type { IcebreakerCommitlintOptions } from '@icebreakers/commitlint-config'
import type {
  UserDefinedOptions as IcebreakerEslintOptions,
  UserConfigItem as IcebreakerEslintUserConfigItem,
} from '@icebreakers/eslint-config'
import type { TemplateDefinition } from '@icebreakers/monorepo-templates'
import type { StylelintConfig as IcebreakerStylelintConfigOptions } from '@icebreakers/stylelint-config'
import type { Configuration as LintStagedConfiguration } from 'lint-staged'
import type { ViteUserConfig } from 'vitest/config'
import type { AgenticTemplateFormat } from '../commands/ai'
import type { CreateNewProjectOptions } from '../commands/create'
import type { InitPreset, InitToolingTarget } from '../commands/init'
import type { CliOpts } from './cli'
import type { ReleaseCommandConfig } from './release'

export interface AiCommandConfig {
  /**
   * 默认输出路径，不填则自动创建 `agentic/prompts/<timestamp>/prompt.md` 文件夹与模板。
   * @default undefined
   */
  output?: string
  /**
   * 默认存放目录，配合 name / tasks 批量生成时使用。
   * @default 'agentic/prompts'
   */
  baseDir?: string
  /**
   * 是否允许覆盖已存在文件。
   * @default false
   */
  force?: boolean
  /**
   * 模板格式。
   * @default 'md'
   */
  format?: AgenticTemplateFormat
  /**
   * 任务清单文件路径（JSON 数组），用于批量生成。
   * @default undefined
   */
  tasksFile?: string
}

/**
 * `repo package create` 命令的配置项。
 */
export interface CreateCommandConfig extends Partial<Omit<CreateNewProjectOptions, 'cwd'>> {
  /**
   * 自定义模板根目录。
   * @default 内置模板所在的 `packages/monorepo/templates`
   */
  templatesDir?: string
  /**
   * 扩展模板映射表，key 为类型，value 为模板来源/目标路径。
   * @default 内置 `templateMap`
   */
  templateMap?: Record<string, string | TemplateDefinition>
  /**
   * 自定义交互提示的选项列表。
   * @default 内置 `baseChoices`
   */
  choices?: CreateChoiceOption[]
  /**
   * 当未选择模板时使用的默认模板。
   * @default 'tsdown'
   */
  defaultTemplate?: CreateNewProjectOptions['type']
}

/**
 * CLI 交互式选择框的选项结构。
 */
export interface CreateChoiceOption {
  /**
   * 唯一值，将回传给命令逻辑使用。
   * @default undefined
   */
  value: string
  /**
   * 选项展示名称。
   * @default value
   */
  name?: string
  /**
   * 选项描述信息。
   * @default undefined
   */
  description?: string
  /**
   * 短名称，用于命令行紧凑展示。
   * @default undefined
   */
  short?: string
  /**
   * 设置为 true 或字符串即可禁用该选项并显示原因。
   * @default false
   */
  disabled?: boolean | string
}

/**
 * `repo workspace clean` 命令配置，可控制自动选择、排除包等行为。
 */
export interface CleanCommandConfig {
  /**
   * 是否跳过交互直接清理全部。
   * @default false
   */
  autoConfirm?: boolean
  /**
   * 不允许被清理的包名列表。
   * @default []
   */
  ignorePackages?: string[]
  /**
   * 是否包含 private 包。
   * @default true
   */
  includePrivate?: boolean
  /**
   * 强制写回的 repoctl 版本。
   * @default 当前依赖版本
   */
  pinnedVersion?: string
}

/**
 * `repo workspace upgrade` 命令配置，覆盖脚本、目标文件等能力。
 */
export interface UpgradeCommandConfig extends Partial<CliOpts> {
  /**
   * 额外需要写入的目标文件列表。
   * @default []
   */
  targets?: string[]
  /**
   * 是否与默认目标合并，false 表示完全覆盖。
   * @default true
   */
  mergeTargets?: boolean
  /**
   * 需要写入 package.json 的脚本集合。
   * @default {}
   */
  scripts?: Record<string, string>
  /**
   * 是否跳过生成 pnpm change intent markdown。
   * @default true
   */
  skipChangesetMarkdown?: boolean
}

/**
 * `repo workspace init` / `repo tooling init` 共享配置，用于跳过部分初始化步骤并配置 tooling 默认目标。
 */
export interface InitCommandConfig {
  /**
   * 是否跳过 README 生成。
   * @default false
   */
  skipReadme?: boolean
  /**
   * 是否跳过 package.json 写入。
   * @default false
   */
  skipPkgJson?: boolean
  /**
   * 是否跳过 pnpm versioning 元数据的更新。
   * @default false
   */
  skipChangeset?: boolean
  /**
   * 是否跳过 Issue 模版 discussions 链接的更新。
   * @default false
   */
  skipIssueTemplateConfig?: boolean
  /**
   * 额外要生成的 tooling 配置文件列表。
   * @default []
   */
  tooling?: InitToolingTarget[]
  /**
   * 初始化预设。
   * @default undefined
   */
  preset?: InitPreset
  /**
   * 是否覆盖已存在的 tooling 配置文件。
   * @default false
   */
  force?: boolean
}

/**
 * `monorepo env mirror` 命令配置，可增加额外的环境变量镜像。
 */
export interface MirrorCommandConfig {
  /**
   * 需要注入的环境变量键值对。
   * @default {}
   */
  env?: Record<string, string>
}

/**
 * `tooling.commitlint` 配置块。
 *
 * 该对象会与 `@icebreakers/commitlint-config` 的默认配置合并。
 */
export interface CommitlintToolingConfig extends IcebreakerCommitlintOptions {
  /**
   * 额外的 commitlint rules。
   * @default undefined
   */
}

/**
 * `tooling.eslint` 配置块。
 *
 * 该对象会与 `@icebreakers/eslint-config` 的默认 flat config 合并。
 */
export interface EslintToolingConfig extends IcebreakerEslintOptions {
  /**
   * 额外传给 `createEslint(...userConfigs)` 的后续配置项。
   * 在 `defineEslintConfig({ options, configs })` 中也可以放到顶层 `configs`。
   * @default []
   */
  configs?: IcebreakerEslintUserConfigItem[]
}

/**
 * `tooling.stylelint` 配置块。
 *
 * 该对象会与 `@icebreakers/stylelint-config` 的默认配置合并。
 */
export interface StylelintToolingConfig extends IcebreakerStylelintConfigOptions {
  /**
   * 额外的 stylelint rules。
   * @default undefined
   */
}

/**
 * `tooling.lintStaged` 配置块。
 */
export interface LintStagedToolingConfig {
  /**
   * 调用 repo CLI 的基础命令。
   * 通常保持为 `pnpm exec repo`，以便 Husky 与 lint-staged 入口统一。
   * @default 'pnpm exec repo'
   */
  repoCommand?: string
  /**
   * 直接透传完整的 lint-staged 原生配置。
   * 一旦提供，monorepo 默认规则将不再自动注入。
   * @default undefined
   */
  config?: LintStagedConfiguration
}

/**
 * `tooling.tsconfig` 配置块。
 *
 * 该对象会与 monorepo 内置的 TypeScript 基线配置合并。
 */
export interface TsconfigToolingConfig {
  /**
   * 顶层 `extends` 字段。
   * @default undefined
   */
  extends?: string | string[]
  /**
   * TypeScript `compilerOptions` 配置。
   * @default undefined
   */
  compilerOptions?: Record<string, unknown>
  /**
   * 顶层 `include` 字段。
   * @default undefined
   */
  include?: string[]
  /**
   * 顶层 `exclude` 字段。
   * @default undefined
   */
  exclude?: string[]
  /**
   * 顶层 `files` 字段。
   * @default undefined
   */
  files?: string[]
  /**
   * 顶层 `references` 字段。
   * @default undefined
   */
  references?: Array<{
    path: string
  }>
  /**
   * 顶层 `compileOnSave` 字段。
   * @default undefined
   */
  compileOnSave?: boolean
}

/**
 * `tooling.vitest` 配置块。
 *
 * 这些字段会参与根级 Vitest 配置的自动推导。
 */
export interface VitestToolingConfig {
  /**
   * 项目扫描与 workspace 文件解析的根目录。
   * @default process.cwd()
   */
  rootDir?: string
  /**
   * 显式指定需要扫描的项目根目录。
   * 未提供时优先从 `pnpm-workspace.yaml` 推导，失败后回退到 `['packages', 'apps']`。
   * @default undefined
   */
  projectRoots?: string[]
  /**
   * 子项目 Vitest 配置文件候选名列表。
   * @default ['vitest.config.ts', 'vitest.config.mts', 'vitest.config.js', 'vitest.config.cjs', 'vitest.workspace.ts', 'vitest.workspace.mts']
   */
  configCandidates?: string[]
  /**
   * workspace 配置文件名。
   * @default 'pnpm-workspace.yaml'
   */
  workspaceFile?: string
  /**
   * 是否把根级 `vitest.config.*` 也加入 `test.projects`。
   * @default false
   */
  includeWorkspaceRootConfig?: boolean
  /**
   * coverage 需要额外排除的 glob。
   * @default undefined
   */
  coverageExclude?: string[]
  /**
   * 是否开启 coverage。
   * @default true
   */
  coverageEnabled?: boolean
  /**
   * 是否对未被测试覆盖的文件也统计 coverage。
   * @default false
   */
  coverageAll?: boolean
  /**
   * 是否跳过 100% 覆盖文件的输出。
   * @default true
   */
  coverageSkipFull?: boolean
  /**
   * 直接透传到最终 `vitest.config.*` 返回值的完整配置覆盖项。
   * 适合配置 `test.coverage`、`resolve.alias`、`plugins` 等原生 Vitest/Vite 字段。
   * @default undefined
   */
  overrides?: ViteUserConfig
}

/**
 * `tooling.vitestProject` 配置块。
 *
 * 用于单个 package/app 的项目级 Vitest 默认值。
 */
export interface VitestProjectToolingConfig {
  /**
   * 测试环境内的 alias 映射。
   * @default undefined
   */
  alias?: Array<{
    find: string | RegExp
    replacement: string
  }>
  /**
   * 是否启用 Vitest globals。
   * @default true
   */
  globals?: boolean
  /**
   * 单测默认超时时间，单位毫秒。
   * @default 60000
   */
  testTimeout?: number
  /**
   * 测试环境类型。
   * @default 'node'
   */
  environment?: string
}

/**
 * `tooling.husky` 配置块。
 */
export interface HuskyToolingConfig {
  /**
   * pre-commit 钩子执行命令。
   * 未设置时默认运行 `pnpm exec lint-staged`。
   * @default undefined
   */
  preCommitCommand?: string
  /**
   * commit-msg 钩子执行命令。
   * 可通过 `{editFile}` 占位符注入 commit message 文件路径。
   * 未设置时默认运行 `pnpm exec commitlint --edit {editFile}`。
   * @default undefined
   */
  commitMsgCommand?: string
}

/**
 * `repoctl.config.ts` 中 `tooling` 总配置。
 *
 * 每个字段分别映射到对应的配置工厂与验证命令。
 */
export interface ToolingConfig {
  commitlint?: CommitlintToolingConfig
  eslint?: EslintToolingConfig
  stylelint?: StylelintToolingConfig
  lintStaged?: LintStagedToolingConfig
  tsconfig?: TsconfigToolingConfig
  vitest?: VitestToolingConfig
  vitestProject?: VitestProjectToolingConfig
  husky?: HuskyToolingConfig
}

/**
 * 项目级配置入口，按命令划分可插拔的配置块。
 */
export interface MonorepoConfig {
  /**
   * 按命令分类的可选配置。
   * 各字段默认均为 `undefined`，命令执行时会按各自逻辑回退到内置默认值。
   * @default {}
   */
  commands?: {
    ai?: AiCommandConfig
    create?: CreateCommandConfig
    clean?: CleanCommandConfig
    upgrade?: UpgradeCommandConfig
    init?: InitCommandConfig
    mirror?: MirrorCommandConfig
    release?: ReleaseCommandConfig
  }
  /**
   * 按工程化能力分类的可选配置。
   * 这些配置通常会被 `repoctl/tooling` 中的 helper 消费。
   * @default {}
   */
  tooling?: ToolingConfig
}

export type { ReleaseAfterPublishHookConfig, ReleaseCommandConfig } from './release'
