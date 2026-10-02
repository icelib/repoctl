import type { AgenticTemplateFormat } from '../commands/ai'
import type { CreateNewProjectOptions } from '../commands/create'
import type { DependencyAdmissionConfig } from '../commands/deps/admission/types'
import type { InitPreset, InitToolingTarget } from '../commands/init'
import type { CodeownersConfig } from '../core/codeowners/types'
import type { CreateTemplateDefinition } from '../core/template-catalog'
import type { WorkspaceBoundariesConfig } from '../core/workspace-boundaries/types'
import type { CleanCommandConfig } from './clean'
import type { CliOpts } from './cli'
import type { ToolingConfig } from './config/tooling'
import type { DependenciesCommandConfig } from './dependencies'
import type { DoctorCommandConfig } from './doctor'
import type { OrganizationPresetReference } from './presets'
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
   * 自定义模板根目录，相对路径按配置文件所在目录解析。
   * @default 已安装模板包的 templates 目录
   */
  templatesDir?: string
  /**
   * 扩展模板映射表，key 为类型，value 为模板来源/目标路径。
   * @default 内置 `templateMap`
   */
  templateMap?: Record<string, string | CreateTemplateDefinition>
  /**
   * 自定义交互提示的选项列表。
   * @default 已解析目录中的全部模板
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
 * 项目级配置入口，按命令划分可插拔的配置块。
 */
export interface MonorepoConfig {
  /** Installed JSON-only organization packages, pinned to exact versions. */
  presets?: OrganizationPresetReference[]
  /** Offline admission of direct third-party declarations, also checked by doctor. */
  dependencyPolicy?: DependencyAdmissionConfig
  /** Internal manifest dependency policies, also checked by doctor when configured. */
  boundaries?: WorkspaceBoundariesConfig
  /** Exact workspace names or relative paths mapped to GitHub owners. */
  codeowners?: CodeownersConfig
  /**
   * 按命令分类的可选配置。
   * 各字段默认均为 `undefined`，命令执行时会按各自逻辑回退到内置默认值。
   * @default {}
   */
  commands?: {
    ai?: AiCommandConfig
    create?: CreateCommandConfig
    clean?: CleanCommandConfig
    deps?: DependenciesCommandConfig
    doctor?: DoctorCommandConfig
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

export type { CleanCommandConfig } from './clean'

export type * from './config/tooling'

export type { DoctorCommandConfig, DoctorOptions, DoctorSuppression } from './doctor'
export type { ReleaseAfterPublishHookConfig, ReleaseCommandConfig } from './release'
