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
   * 参与变更归属计算的 workspace 列表。
   * @default 内置 `defaultWorkspaceOrder`
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
