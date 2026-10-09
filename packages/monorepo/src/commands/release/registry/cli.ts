import type { ReleaseOptions } from '../types'
import { spawn } from 'node:child_process'
import { getReleaseEnv } from '../shared'

export async function queryNpm(args: string[], timeout: number, options: ReleaseOptions) {
  const settings = { cwd: options.cwd, env: getReleaseEnv(options), encoding: 'utf8' as const, shell: false, timeout, killSignal: 'SIGKILL' as const, stdio: ['ignore', 'pipe', 'pipe'] as ['ignore', 'pipe', 'pipe'] }
  if (options.spawn) {
    return options.spawn('npm', args, settings)
  }
  return new Promise<{ status: number | null, stdout: string, stderr: string, error?: Error }>((resolve) => {
    const child = spawn('npm', args, settings)
    let stdout = ''
    let stderr = ''
    let error: Error | undefined
    child.on('error', (value) => {
      error = value
    })
    child.stdout.on('data', (value) => {
      stdout += String(value)
    })
    child.stderr.on('data', (value) => {
      stderr += String(value)
    })
    child.on('close', status => resolve({ status, stdout, stderr, ...(error ? { error } : {}) }))
  })
}
