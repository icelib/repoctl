import type { NightlyOptions, NightlyReport } from './types'
import process from 'node:process'
import crossSpawn from 'cross-spawn'

export function nightlyCommand(report: NightlyReport, options: NightlyOptions, executable: string, args: string[]) {
  const result = (options.spawn ?? crossSpawn.sync)(executable, args, {
    cwd: options.cwd,
    env: { ...(options.env ?? process.env), COREPACK_ENABLE_AUTO_PIN: '0', NO_COLOR: '1', FORCE_COLOR: '0' },
    encoding: 'utf8',
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 600_000,
    maxBuffer: 16 * 1024 * 1024,
  })
  const stdout = result.stdout?.toString() ?? ''
  const stderr = result.stderr?.toString() ?? ''
  report.commands.push({ cwd: options.cwd, executable, args, exitCode: result.status, output: `${stdout}\n${stderr}`.slice(-8000), stdout: stdout.slice(-8000), stderr: stderr.slice(-8000) })
  if (result.error || result.status !== 0) {
    throw new Error(`Nightly ${executable} ${args.join(' ')} failed: ${result.error?.message ?? stderr.trim().slice(-2000) ?? result.status}`)
  }
  return stdout.trim()
}
