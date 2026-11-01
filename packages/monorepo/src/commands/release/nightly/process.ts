import type { NightlyOptions, NightlyReport } from './types'
import process from 'node:process'
import crossSpawn from 'cross-spawn'
import { defaultNightlyQualityTimeoutMs } from '../../../core/nightly/config'

export function nightlyCommand(report: NightlyReport, options: NightlyOptions, executable: string, args: string[], timeout = 600_000) {
  const result = (options.spawn ?? crossSpawn.sync)(executable, args, {
    cwd: options.cwd,
    env: { ...(options.env ?? process.env), COREPACK_ENABLE_AUTO_PIN: '0', NO_COLOR: '1', FORCE_COLOR: '0' },
    encoding: 'utf8',
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout,
    maxBuffer: 16 * 1024 * 1024,
  })
  const stdout = result.stdout?.toString() ?? ''
  const stderr = result.stderr?.toString() ?? ''
  report.commands.push({ cwd: options.cwd, executable, args, exitCode: result.status, output: `${stdout}\n${stderr}`.slice(-8000), stdout: stdout.slice(-8000), stderr: stderr.slice(-8000) })
  if (result.error || result.status !== 0) {
    const reason = result.error && 'code' in result.error && result.error.code === 'ETIMEDOUT'
      ? `timed out after ${timeout} ms (${result.error.message})`
      : result.error?.message ?? (stderr.trim().slice(-2000) || `exit code ${result.status}`)
    throw new Error(`Nightly ${executable} ${args.join(' ')} failed: ${reason}`)
  }
  return stdout.trim()
}

/** 仅为质量脚本和验证 hook 计算共享剩余预算，发布命令保留独立超时。 */
export function nightlyQualityCommand(report: NightlyReport, options: NightlyOptions, executable: string, args: string[], timeout = defaultNightlyQualityTimeoutMs) {
  const deadline = (options.env ?? process.env)['REPOCTL_NIGHTLY_QUALITY_DEADLINE_EPOCH']
  if (deadline !== undefined) {
    const milliseconds = Number(deadline) * 1000
    if (!deadline || /\D/u.test(deadline) || milliseconds <= 0 || !Number.isSafeInteger(milliseconds)) {
      throw new Error('Nightly quality deadline must be a positive safe integer epoch timestamp.')
    }
    timeout = Math.min(milliseconds - Date.now(), 2_147_483_647)
    if (timeout <= 0) {
      throw new Error('Nightly shared quality budget exhausted before starting a command.')
    }
  }
  return nightlyCommand(report, options, executable, args, timeout)
}
