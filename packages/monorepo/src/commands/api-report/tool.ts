import type { PublicApiDiagnostic, PublicApiOptions } from './types'
import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import process from 'node:process'
import { promisify } from 'node:util'
import path from 'pathe'
import semver from 'semver'
import { packageDir } from '../../constants'
import { hash, record } from '../deps/files'

export async function resolveApiExtractor(root: string) {
  const require = createRequire(path.join(root, 'package.json'))
  let module: string
  let manifest: { name?: string, version?: string }
  try {
    const directory = path.join(root, 'node_modules/@microsoft/api-extractor')
    manifest = JSON.parse(await readFile(path.join(directory, 'package.json'), 'utf8'))
    module = require.resolve(directory)
  }
  catch {
    throw new Error('Install @microsoft/api-extractor >=7.52.12 <8 in the workspace before checking API reports. repoctl does not install tools.')
  }
  if (manifest.name !== '@microsoft/api-extractor' || !manifest.version || !semver.satisfies(manifest.version, '>=7.52.12 <8')) {
    throw new Error('Public API reports require a stable @microsoft/api-extractor >=7.52.12 <8.')
  }
  return { module, version: manifest.version, moduleHash: hash(await readFile(module, 'utf8')) }
}

export async function extractPublicApi(root: string, tool: string, packageJson: string, entryPoint: string, tsconfig: string, options: PublicApiOptions & { timeoutMs: number }) {
  options.signal?.throwIfAborted()
  const temporary = await mkdtemp(path.join(tmpdir(), 'repoctl-api-report-'))
  try {
    const job = path.join(temporary, 'job.json')
    await writeFile(job, JSON.stringify({ root, temporary, tool, packageJson, entryPoint, tsconfig }))
    let stdout = ''
    let processFailed = false
    try {
      const result = await promisify(execFile)(process.execPath, [path.join(packageDir, 'resources/api-report/runner.cjs'), job], {
        cwd: root,
        timeout: options.timeoutMs,
        maxBuffer: 4 * 1024 * 1024,
        signal: options.signal,
        env: { ...process.env, NO_COLOR: '1' },
      })
      stdout = result.stdout
    }
    catch (error) {
      options.signal?.throwIfAborted()
      processFailed = true
      const output = (error as { stdout?: string }).stdout
      if (typeof output !== 'string' || !output) {
        throw new Error('API Extractor process failed, timed out, or exceeded 4 MiB output. Input and process output are omitted.')
      }
      stdout = output
    }
    let result: Record<string, unknown> | undefined
    try {
      result = record(JSON.parse(stdout))
    }
    catch {
      throw new Error('API Extractor returned invalid analysis output.')
    }
    if (!result || typeof result['succeeded'] !== 'boolean' || !Array.isArray(result['diagnostics'])
      || (result['report'] !== null && typeof result['report'] !== 'string')
      || (result['succeeded'] && (!Array.isArray(result['inputs']) || result['inputs'].some(item => !record(item) || typeof item.path !== 'string' || !path.isAbsolute(item.path) || typeof item.hash !== 'string' || !/^[a-f\d]{64}$/u.test(item.hash))))
      || (result['succeeded'] && (processFailed || typeof result['inputHash'] !== 'string' || !/^[a-f\d]{64}$/u.test(result['inputHash']) || typeof result['report'] !== 'string' || !result['report'].startsWith('## API Report File for ')))
      || result['diagnostics'].some(item => !record(item) || typeof item.code !== 'string' || typeof item.message !== 'string' || !['warning', 'error'].includes(item.severity))) {
      throw new Error('API Extractor returned an incomplete analysis result.')
    }
    return { inputs: (result['inputs'] ?? []) as Array<{ path: string, hash: string }>, inputHash: typeof result['inputHash'] === 'string' ? result['inputHash'] : null, succeeded: result['succeeded'], diagnostics: result['diagnostics'] as PublicApiDiagnostic[], report: result['report'] as string | null }
  }
  finally {
    await rm(temporary, { recursive: true, force: true })
  }
}
