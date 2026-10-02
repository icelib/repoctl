import type { Buffer } from 'node:buffer'
import type { execFileSync, spawnSync, SpawnSyncReturns } from 'node:child_process'

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
   * 非删除 ref 按实际 commit 在临时克隆中校验；空输入仅校验本地。
   * @default undefined
   */
  stdinText?: string
  /**
   * 参与变更归属计算的 workspace 列表。
   * 相对 cwd 解析后映射到推送提交，保留调用目录边界。
   * @default 从目标工程的 pnpm workspace 配置发现所有包（含 private 包）
   */
  workspaces?: string[]
  /**
   * 可注入的 `execFileSync` 实现，主要用于测试。
   * @default node:child_process.execFileSync
   */
  execFile?: typeof execFileSync
  /**
   * 可注入的同步执行实现，主要用于测试；包含临时克隆内的依赖安装。
   * 默认对推送提交使用可中断的异步执行器，本地模式使用 spawnSync。
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

/** 用于测试场景的 `spawnSync` 返回值类型别名。 */
export type VerifySpawnResult = SpawnSyncReturns<Buffer>
