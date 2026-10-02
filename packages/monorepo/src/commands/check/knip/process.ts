import { Buffer } from 'node:buffer'
import { spawn } from 'node:child_process'
import process from 'node:process'
import { stopCheckProcessTree } from '../process'

interface KnipProcessResult {
  exitCode: number | null
  stdout: string
  stderr: string
  failure: { code: string, message: string } | null
}

export async function executeKnip(executable: string, args: string[], cwd: string, timeout: number, signal?: AbortSignal): Promise<KnipProcessResult> {
  if (signal?.aborted) {
    return { exitCode: null, stdout: '', stderr: '', failure: { code: 'ABORT_ERR', message: 'Knip analysis was cancelled.' } }
  }
  return new Promise((resolve) => {
    const result: KnipProcessResult = { exitCode: null, stdout: '', stderr: '', failure: null }
    const child = spawn(executable, args, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: process.platform !== 'win32',
      // Knip's config loader otherwise creates node_modules/.cache/jiti, even without --cache.
      env: { ...process.env, JITI_FS_CACHE: 'false' },
    })
    let escalation: ReturnType<typeof setTimeout> | undefined
    let bytes = 0
    const stop = (code: string, message: string) => {
      if (result.failure) {
        return
      }
      result.failure = { code, message }
      stopCheckProcessTree(child, 'SIGTERM')
      escalation = setTimeout(stopCheckProcessTree, 1000, child, 'SIGKILL')
      escalation.unref()
    }
    const abort = () => stop('ABORT_ERR', 'Knip analysis was cancelled.')
    const timer = setTimeout(stop, timeout, 'TIMEOUT', `Knip analysis exceeded ${timeout} ms.`)
    const append = (key: 'stdout' | 'stderr', chunk: string) => {
      bytes += Buffer.byteLength(chunk)
      if (bytes > 32 * 1024 * 1024) {
        stop('OUTPUT_LIMIT', 'Knip analysis exceeded the 32 MiB output limit.')
      }
      else {
        result[key] += chunk
      }
    }
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => append('stdout', chunk))
    child.stderr.setEncoding('utf8').on('data', (chunk: string) => append('stderr', chunk))
    child.once('error', (error: NodeJS.ErrnoException) => {
      result.failure ??= { code: error.code ?? 'SPAWN_ERROR', message: error.message }
    })
    child.once('close', (code, childSignal) => {
      clearTimeout(timer)
      if (escalation) {
        clearTimeout(escalation)
      }
      signal?.removeEventListener('abort', abort)
      result.exitCode = code
      if (result.failure) {
        stopCheckProcessTree(child, 'SIGKILL')
      }
      else if (childSignal || (code !== 0 && code !== 1)) {
        result.failure = { code: childSignal ?? `KNIP_EXIT_${code}`, message: `Knip analysis stopped with ${childSignal ?? `exit code ${code}`}.` }
      }
      resolve(result)
    })
    signal?.addEventListener('abort', abort, { once: true })
    if (signal?.aborted) {
      abort()
    }
  })
}
