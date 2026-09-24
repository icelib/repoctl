import type { SpawnSyncReturns } from 'node:child_process'
import type { ReleaseOptions } from '../types'
import { spawnSync } from 'node:child_process'
import process from 'node:process'
import { getReleaseEnv } from '../shared'
import { outputText } from './evidence'

export function runPublishAttempt(args: string[], options: ReleaseOptions) {
  const result = (options.spawn ?? spawnSync)('pnpm', args, {
    cwd: options.cwd,
    encoding: 'utf8',
    env: getReleaseEnv(options),
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 16 * 1024 * 1024,
  }) as SpawnSyncReturns<string>
  const stdout = outputText(result.stdout)
  const stderr = outputText(result.stderr)
  if (stdout) {
    process.stdout.write(stdout)
  }
  if (stderr) {
    process.stderr.write(stderr)
  }
  return { ...result, output: `${stdout}\n${stderr}` }
}
