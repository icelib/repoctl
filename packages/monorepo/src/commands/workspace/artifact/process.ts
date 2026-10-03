import type { ChildProcess } from 'node:child_process'
import type { WorkspaceArtifactApplyOptions } from '../../../types/artifact'
import { spawnSync } from 'node:child_process'
import process from 'node:process'
import spawn from 'cross-spawn'

export const pnpmGuards = ['--config.pm-on-fail=ignore', '--config.runtime-on-fail=ignore', '--config.manage-package-manager-versions=false', '--config.ignore-pnpmfile=true', '--config.ignore-scripts=true']

function stop(child: ChildProcess) {
  if (!child.pid) {
    return
  }
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
    return
  }
  try {
    process.kill(-child.pid, 'SIGKILL')
  }
  catch {
    child.kill('SIGKILL')
  }
}

export function runNative(executable: string, args: string[], cwd: string, options: WorkspaceArtifactApplyOptions = {}) {
  options.signal?.throwIfAborted()
  const timeoutMs = options.timeoutMs ?? 120000
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 600000) {
    throw new Error('Artifact timeout must be an integer from 1 to 600000 milliseconds.')
  }
  return new Promise<string>((resolve, reject) => {
    const child = spawn(executable, args, {
      cwd,
      detached: process.platform !== 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, CI: 'true', NO_COLOR: '1', FORCE_COLOR: '0', COREPACK_ENABLE_AUTO_PIN: '0', COREPACK_ENABLE_NETWORK: '0', TURBO_TELEMETRY_DISABLED: '1' },
    })
    let stdout = ''
    let stderr = ''
    let failure = ''
    const halt = () => stop(child)
    const abort = () => {
      failure = 'Operation aborted'
      halt()
    }
    const append = (text: string, channel: 'stdout' | 'stderr') => {
      if (channel === 'stdout') {
        stdout += text
      }
      else {
        stderr += text
      }
      if (stdout.length + stderr.length > 4 * 1024 * 1024) {
        stdout = stdout.slice(-65536)
        stderr = stderr.slice(-65536)
        failure = 'Native output exceeded 4 MiB'
        halt()
      }
    }
    process.once('exit', halt)
    options.signal?.addEventListener('abort', abort, { once: true })
    const timer = setTimeout(() => {
      failure = `Command timed out after ${timeoutMs}ms`
      halt()
    }, timeoutMs)
    timer.unref()
    child.stdout?.setEncoding('utf8').on('data', text => append(text, 'stdout'))
    child.stderr?.setEncoding('utf8').on('data', text => append(text, 'stderr'))
    child.once('error', (error) => {
      failure = error.message
    })
    child.once('close', (code) => {
      clearTimeout(timer)
      process.removeListener('exit', halt)
      options.signal?.removeEventListener('abort', abort)
      if (failure || code !== 0) {
        reject(new Error(`Native artifact command failed (${failure || `exit ${code}`}): ${executable} ${args.join(' ')}\n${stderr}${stdout}`))
      }
      else {
        resolve(stdout.trim())
      }
    })
  })
}
