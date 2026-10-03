import type { ReleaseBranchesConfig } from '../commands/release/lines/types'

export interface ReleaseAfterPublishHookConfig {
  /** 执行结果未知时是否允许重试；仅适用于可安全重复执行的脚本。默认 false。 */
  idempotent?: boolean
  /** package.json 中要通过 `pnpm run` 执行的脚本名。 */
  script: string
  /**
   * 脚本失败时是否只记录警告并继续。
   * @default false
   */
  continueOnError?: boolean
}

export interface ReleaseCommandConfig {
  /** Stable, maintenance and prerelease branch mappings. */
  branches?: ReleaseBranchesConfig
  /**
   * version 与 publish 阶段执行的根 package.json 校验脚本。
   * 配置后完整替换内置的 build、lint、test。
   * @default ['build', 'lint', 'test']
   */
  qualityScripts?: string[]
  hooks?: {
    /**
     * qualityScripts 通过后追加执行的校验脚本。
     * 任一脚本失败都会中止版本或发布流程。
     * @default []
     */
    verify?: string[]
    /**
     * pnpm version 前执行的根 package.json 脚本。
     * @default []
     */
    beforeVersion?: string[]
    /**
     * pnpm version 后执行的根 package.json 脚本。
     * @default []
     */
    afterVersion?: string[]
    /**
     * pnpm publish 前执行的根 package.json 脚本。
     * @default []
     */
    beforePublish?: string[]
    /**
     * npm metadata 与 GitHub Release 处理完成后执行的根 package.json 脚本。
     * 在新发布或恢复未完成发布时执行；跨 runner 恢复会跳过已完成的脚本。
     * @default []
     */
    afterPublish?: ReleaseAfterPublishHookConfig[]
  }
}

export type { ReleaseBranchesConfig, ReleaseBranchRule } from '../commands/release/lines/types'
