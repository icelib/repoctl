import type { BetterStylelintMessage, BetterStylelintOptions } from './types'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

interface StylelintWarning {
  rule?: string
  severity?: 'error' | 'warning' | string
  text: string
  line?: number
  column?: number
  endLine?: number
  endColumn?: number
}

interface StylelintResult {
  warnings?: StylelintWarning[]
  parseErrors?: StylelintWarning[]
}

interface StylelintWorkerSuccess {
  ok: true
  result: StylelintResult
}

interface StylelintWorkerFailure {
  ok: false
  error: string
}

type StylelintWorkerResponse = StylelintWorkerSuccess | StylelintWorkerFailure
type RunStylelintWorker = (
  code: string,
  filename: string,
  options: Required<Pick<BetterStylelintOptions, 'cwd'>> & BetterStylelintOptions,
) => StylelintWorkerResponse

const MAX_CACHE_ENTRIES = 100
const resultCache = new Map<string, BetterStylelintMessage[]>()
const configCacheIds = new WeakMap<object, number>()
let nextConfigCacheId = 0
const UNSUPPORTED_EXEC_ARGV_FLAGS = new Set([
  '--eval',
  '-e',
  '--print',
  '-p',
])

function normalizeStylelintResults(
  result: StylelintResult,
): BetterStylelintMessage[] {
  const warnings = [
    ...(result.warnings ?? []),
    ...(result.parseErrors ?? []),
  ]

  return warnings.map(warning => ({
    ruleId: warning.rule ?? 'stylelint',
    message: warning.text,
    line: warning.line ?? 1,
    column: warning.column ?? 1,
    ...(warning.endLine !== undefined ? { endLine: warning.endLine } : {}),
    ...(warning.endColumn !== undefined ? { endColumn: warning.endColumn } : {}),
    severity: warning.severity === 'warning' ? 1 : 2,
    ...(warning.rule === undefined ? { fatal: true } : {}),
  }))
}

function createBridgeError(message: string): BetterStylelintMessage[] {
  return [
    {
      ruleId: 'stylelint/bridge',
      message,
      line: 1,
      column: 1,
      severity: 2,
      fatal: true,
    },
  ]
}

function cloneMessages(messages: BetterStylelintMessage[]): BetterStylelintMessage[] {
  return messages.map(message => ({ ...message }))
}

function getConfigCacheKey(config: BetterStylelintOptions['config']) {
  if (!config || typeof config !== 'object') {
    return 'no-config'
  }

  let cacheId = configCacheIds.get(config)

  if (cacheId === undefined) {
    nextConfigCacheId += 1
    cacheId = nextConfigCacheId
    configCacheIds.set(config, cacheId)
  }

  return `config:${cacheId}`
}

function normalizeLintOptions(
  filename: string,
  options?: BetterStylelintOptions | string,
): Required<Pick<BetterStylelintOptions, 'cwd'>> & BetterStylelintOptions {
  if (typeof options === 'string') {
    return { cwd: options }
  }

  return {
    ...options,
    cwd: options?.cwd ?? path.dirname(filename),
  }
}

function createCacheKey(
  code: string,
  filename: string,
  options: Required<Pick<BetterStylelintOptions, 'cwd'>> & BetterStylelintOptions,
): string {
  const codeHash = createHash('sha1').update(code).digest('hex')
  return `${options.cwd}\0${filename}\0${options.configLoader ?? 'no-loader'}\0${getConfigCacheKey(options.config ?? options.configOptions)}\0${codeHash}`
}

function getCachedMessages(cacheKey: string): BetterStylelintMessage[] | undefined {
  const cached = resultCache.get(cacheKey)

  if (!cached) {
    return undefined
  }

  resultCache.delete(cacheKey)
  resultCache.set(cacheKey, cached)
  return cloneMessages(cached)
}

function setCachedMessages(cacheKey: string, messages: BetterStylelintMessage[]): BetterStylelintMessage[] {
  if (resultCache.has(cacheKey)) {
    resultCache.delete(cacheKey)
  }

  resultCache.set(cacheKey, messages)

  while (resultCache.size > MAX_CACHE_ENTRIES) {
    const oldestKey = resultCache.keys().next().value
    if (oldestKey === undefined) {
      break
    }
    resultCache.delete(oldestKey)
  }

  return cloneMessages(messages)
}

function resolveWorkerPath() {
  const currentFilePath = fileURLToPath(import.meta.url)
  if (currentFilePath.endsWith('.ts')) {
    return path.resolve(path.dirname(currentFilePath), '../dist/worker.js')
  }
  return path.resolve(path.dirname(currentFilePath), 'worker.js')
}

function getWorkerExecArgv() {
  const workerExecArgv: string[] = []

  for (let index = 0; index < process.execArgv.length; index += 1) {
    const arg = process.execArgv[index]

    if (!arg) {
      continue
    }

    if (arg === '--input-type' || arg.startsWith('--input-type=')) {
      if (arg === '--input-type') {
        index += 1
      }
      continue
    }

    if (UNSUPPORTED_EXEC_ARGV_FLAGS.has(arg)) {
      index += 1
      continue
    }

    workerExecArgv.push(arg)
  }

  return workerExecArgv
}

function resolveWorkerCommand(workerPath: string) {
  return {
    command: process.execPath,
    args: [...getWorkerExecArgv(), workerPath],
  }
}

function getRunStylelintWorker(): RunStylelintWorker {
  return (code, filename, options) => {
    const worker = resolveWorkerCommand(resolveWorkerPath())
    const output = execFileSync(worker.command, worker.args, {
      input: JSON.stringify({
        code,
        filename,
        options,
      }),
      encoding: 'utf8',
      env: {
        ...process.env,
        ICEBREAKER_STYLELINT_WORKER: '1',
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    return JSON.parse(output) as StylelintWorkerResponse
  }
}

export function runStylelintSync(
  code: string,
  filename: string,
  options?: BetterStylelintOptions | string,
): BetterStylelintMessage[] {
  const normalizedOptions = normalizeLintOptions(filename, options)
  const cacheKey = createCacheKey(code, filename, normalizedOptions)
  const cached = getCachedMessages(cacheKey)

  if (cached) {
    return cached
  }

  const response = getRunStylelintWorker()(code, filename, normalizedOptions)

  if (!response.ok) {
    return setCachedMessages(cacheKey, createBridgeError(response.error))
  }

  return setCachedMessages(cacheKey, normalizeStylelintResults(response.result))
}

export function __clearStylelintResultCache() {
  resultCache.clear()
}

export function __getStylelintResultCacheSize() {
  return resultCache.size
}

export function __resetStylelintWorker() {
  // No-op: the bridge now uses short-lived child processes per invocation.
}
