import type { execFileSync, spawnSync } from 'node:child_process'

export interface VerifyCommandOptions {
  /**
   * 命令执行根目录。
   * @default process.cwd()
   */
  cwd?: string
}

export interface PrePushVerifyOptions extends VerifyCommandOptions {
  /**
   * pre-push hook 的 stdin 原始文本。
   * 未提供时会从真实 stdin 读取。
   * @default undefined
   */
  stdinText?: string
  /**
   * 参与变更归属计算的 workspace 目录列表，相对于 cwd。
   * 显式提供（含空数组）时覆盖自动发现，按最长目录优先匹配。
   * @default 从 pnpm-workspace.yaml 发现，包含 private 包并排除根包
   */
  workspaces?: string[]
  /**
   * 可注入的 `execFileSync` 实现，主要用于测试。
   * @default node:child_process.execFileSync
   */
  execFile?: typeof execFileSync
  /**
   * 可注入的 `spawnSync` 实现，主要用于测试。
   * @default node:child_process.spawnSync
   */
  spawn?: typeof spawnSync
}

export interface StagedTypecheckOptions extends VerifyCommandOptions {
  /**
   * 可注入的 `spawnSync` 实现，主要用于测试。
   * @default node:child_process.spawnSync
   */
  spawn?: typeof spawnSync
}

export interface CommitMsgVerifyOptions extends VerifyCommandOptions {
  /**
   * commit message 文件路径。
   */
  editFile: string
  /**
   * 可注入的 `spawnSync` 实现，主要用于测试。
   * @default node:child_process.spawnSync
   */
  spawn?: typeof spawnSync
}

export interface PreCommitVerifyOptions extends VerifyCommandOptions {
  /**
   * 可注入的 `spawnSync` 实现，主要用于测试。
   * @default node:child_process.spawnSync
   */
  spawn?: typeof spawnSync
}
