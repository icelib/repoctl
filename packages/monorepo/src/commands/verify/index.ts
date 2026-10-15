import type { CommitMsgVerifyOptions, PreCommitVerifyOptions } from './types'
import { spawnSync } from 'node:child_process'
import process from 'node:process'
import { runPnpmCommand } from './run'

export { verifyPrePush } from './pre-push'
export { verifyStagedTypecheck } from './staged'
export type * from './types'

/** Validate a commit message using the repository's commitlint configuration. */
export async function verifyCommitMsg(options: CommitMsgVerifyOptions) {
  const cwd = options.cwd ?? process.cwd()
  runPnpmCommand(cwd, `[commit-msg] ${options.editFile}`, ['exec', 'commitlint', '--edit', options.editFile], options.spawn ?? spawnSync)
}

/** Run the native Lefthook pipeline; its jobs must not call this wrapper. */
export async function verifyPreCommit(options: PreCommitVerifyOptions = {}) {
  const cwd = options.cwd ?? process.cwd()
  runPnpmCommand(cwd, '[pre-commit] lefthook', ['exec', 'lefthook', 'run', 'pre-commit'], options.spawn ?? spawnSync)
}
