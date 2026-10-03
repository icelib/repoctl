import type { MaintenanceUpgradeOptions } from './types'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import process from 'node:process'
import crossSpawn from 'cross-spawn'

export const digest = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex')

export const maintenanceGitBytes = (cwd: string, args: string[]) => execFileSync('git', ['--no-optional-locks', ...args], { cwd, timeout: 30_000, maxBuffer: 32 * 1024 * 1024 })

export function maintenanceGit(cwd: string, args: string[], env = process.env) {
  const result = crossSpawn.sync('git', ['--no-optional-locks', ...args], { cwd, env, encoding: 'utf8', shell: false, timeout: 30_000, maxBuffer: 32 * 1024 * 1024 })
  if (result.error || result.status !== 0) {
    throw new Error(`Maintenance Git ${args[0]} failed: ${result.error?.message ?? result.stderr.trim()}`)
  }
  return result.stdout
}

export function maintenanceCommand(options: MaintenanceUpgradeOptions, args: string[]) {
  const result = (options.spawn ?? crossSpawn.sync)('pnpm', args, {
    cwd: options.cwd,
    env: { ...(options.env ?? process.env), CI: 'true', COREPACK_ENABLE_AUTO_PIN: '0' },
    encoding: 'utf8',
    shell: false,
    timeout: 600_000,
    maxBuffer: 16 * 1024 * 1024,
  })
  return { passed: !result.error && result.status === 0, output: `${result.stdout ?? ''}\n${result.stderr ?? ''}\n${result.error?.message ?? ''}` }
}
