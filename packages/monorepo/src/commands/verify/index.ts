import type { Buffer } from 'node:buffer'
import type { SpawnSyncReturns } from 'node:child_process'
import type { CommitMsgVerifyOptions, PreCommitVerifyOptions } from './types'
import { spawnSync } from 'node:child_process'
import process from 'node:process'
import { resolveToolingConfig } from '../../core/config'
import { runPnpmCommand } from './run'

export { verifyPrePush } from './pre-push'
export { verifyStagedTypecheck } from './staged'

export type * from './types'

function runShellCommand(cwd: string, label: string, command: string, spawn: typeof spawnSync) {
  process.stdout.write(`${label}\n`)
  const result = spawn('sh', ['-lc', command], {
    cwd,
    stdio: 'inherit',
  })
  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

/**
 * 执行 commit-msg 校验。
 *
 * 优先读取 `tooling.husky.commitMsgCommand`；若未配置，则回退到
 * `pnpm exec commitlint --edit <editFile>`。
 *
 * @param options commit-msg 运行参数
 */
export async function verifyCommitMsg(options: CommitMsgVerifyOptions) {
  const cwd = options.cwd ?? process.cwd()
  const spawn = options.spawn ?? spawnSync
  const toolingConfig = await resolveToolingConfig(cwd)
  const command = toolingConfig.husky?.commitMsgCommand?.replaceAll('{editFile}', options.editFile)

  if (command) {
    runShellCommand(cwd, `[commit-msg] ${options.editFile}`, command, spawn)
    return
  }

  runPnpmCommand(cwd, `[commit-msg] ${options.editFile}`, ['exec', 'commitlint', '--edit', options.editFile], spawn)
}

/**
 * 执行 pre-commit 校验。
 *
 * 优先读取 `tooling.husky.preCommitCommand`；若未配置，则回退到
 * `pnpm exec lint-staged`。
 *
 * @param options pre-commit 运行参数
 */
export async function verifyPreCommit(options: PreCommitVerifyOptions = {}) {
  const cwd = options.cwd ?? process.cwd()
  const spawn = options.spawn ?? spawnSync
  const toolingConfig = await resolveToolingConfig(cwd)
  const command = toolingConfig.husky?.preCommitCommand

  if (command) {
    runShellCommand(cwd, '[pre-commit] lint-staged', command, spawn)
    return
  }

  runPnpmCommand(cwd, '[pre-commit] lint-staged', ['exec', 'lint-staged'], spawn)
}

/**
 * 用于测试场景的 `spawnSync` 返回值类型别名。
 */
export type VerifySpawnResult = SpawnSyncReturns<Buffer>
