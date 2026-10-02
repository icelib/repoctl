/**
 * `repo workspace clean` 命令配置，可控制自动选择、排除包等行为。
 */
export interface CleanCommandConfig {
  /**
   * 是否跳过交互直接清理全部。
   * @default false
   */
  autoConfirm?: boolean
  /** 仅输出完整清理计划，不删除目录或修改元数据。 */
  dryRun?: boolean
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
   * 显式指定根 devDependencies.repoctl 的版本；未设置时保留现有版本，缺失时使用 latest。
   * @default 当前依赖版本
   */
  pinnedVersion?: string
}
