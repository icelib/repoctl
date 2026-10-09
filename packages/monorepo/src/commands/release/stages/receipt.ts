import type { PublishedPackage, ReleaseCiOptions, ReleaseCiStage } from '../types'
import { createHash, randomUUID } from 'node:crypto'
import { appendFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { performance } from 'node:perf_hooks'
import path from 'pathe'
import { logger } from '../../../core/logger'
import { ReleaseCommandError } from '../errors'
import { getPublishCandidates } from '../publish'
import { packageKey } from '../publish/state'
import { capture, getReleaseEnv, resolveReleaseMode } from '../shared'

export interface StageReceipt {
  schemaVersion: 1
  id: string
  identity: string
  effectiveIdentity?: string
  action: 'skip' | 'prepare' | 'prerelease' | 'publish' | 'reconcile'
  publish: boolean
  done: ReleaseCiStage[]
  candidates: PublishedPackage[]
  sourceDirectory?: string
  stages: Array<{ stage: ReleaseCiStage, elapsedMs: number, status: 'complete' | 'failed', count: number, pending: string[] }>
}

function ordered(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(ordered)
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, ordered(item)]))
  }
  return value
}

export function stageDirectory(options: ReleaseCiOptions) {
  const directory = capture('git', ['rev-parse', '--git-dir'], options)
  if (!directory) {
    throw new ReleaseCommandError('Staged release requires a Git checkout')
  }
  return path.resolve(options.cwd, directory, 'repoctl-release-ci')
}

export async function stageIdentity(options: ReleaseCiOptions) {
  const env = getReleaseEnv(options)
  const untracked = capture('git', ['ls-files', '--others', '--exclude-standard', '-z'], options).split('\0').filter(Boolean).filter(file => !['repoctl-ci-progress.json', 'repoctl-publish-progress.json', 'repoctl-release-progress.json', 'pnpm-publish-summary.json'].includes(file))
  const files = await Promise.all(untracked.sort().map(async file => [file, createHash('sha256').update(await readFile(path.join(options.cwd, file))).digest('hex')]))
  const value = {
    files,
    repository: env['GITHUB_REPOSITORY'] ?? capture('git', ['remote', 'get-url', 'origin'], options),
    source: capture('git', ['rev-parse', 'HEAD'], options),
    diff: capture('git', ['diff', '--binary', 'HEAD'], options),
    candidates: (await getPublishCandidates(options.cwd)).map(packageKey).sort(),
    configuration: options.config,
    branch: options.branch ?? env['GITHUB_REF_NAME'],
    mode: resolveReleaseMode(options),
    recovery: options.sourceSha ?? env['REPO_RELEASE_RECOVERY_SOURCE_SHA'],
    selection: [options.packageName ?? env['REPO_RELEASE_PACKAGE'], options.packageVersion ?? env['REPO_RELEASE_VERSION']],
    dryRun: options.dryRun ?? env['REPO_RELEASE_DRY_RUN'] === 'true',
    run: [env['GITHUB_RUN_ID'], env['GITHUB_RUN_ATTEMPT']],
  }
  return createHash('sha256').update(JSON.stringify(ordered(value))).digest('hex')
}

export async function saveReceipt(receipt: StageReceipt, options: ReleaseCiOptions) {
  const directory = stageDirectory(options)
  await mkdir(directory, { recursive: true })
  const exclude = path.resolve(directory, '../info/exclude')
  await mkdir(path.dirname(exclude), { recursive: true })
  const previous = await readFile(exclude, 'utf8').catch((error: NodeJS.ErrnoException) => {
    if (error.code !== 'ENOENT') {
      throw error
    }
    return ''
  })
  const ignored = ['repoctl-ci-progress.json', 'repoctl-publish-progress.json', 'repoctl-release-progress.json', 'pnpm-publish-summary.json'].map(file => `/${file}`).filter(file => !previous.split('\n').includes(file))
  if (ignored.length) {
    await appendFile(exclude, `\n${ignored.join('\n')}\n`)
  }
  const filename = path.join(directory, 'receipt.json')
  const temporary = `${filename}.${randomUUID()}.tmp`
  await writeFile(temporary, `${JSON.stringify(receipt, null, 2)}\n`)
  await rename(temporary, filename)
  await writeFile(path.join(options.cwd, 'repoctl-ci-progress.json'), `${JSON.stringify(receipt, null, 2)}\n`)
}

export async function readReceipt(options: ReleaseCiOptions) {
  try {
    const receipt = JSON.parse(await readFile(path.join(stageDirectory(options), 'receipt.json'), 'utf8')) as StageReceipt
    if (receipt.schemaVersion !== 1 || receipt.identity !== await stageIdentity(options)) {
      throw new ReleaseCommandError('Stale release stage receipt: repository, source, candidates, configuration or run changed; restart at plan and verify')
    }
    return receipt
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new ReleaseCommandError('Release stage receipt missing; run plan and verify first')
    }
    throw error
  }
}

export async function stageOutput(options: ReleaseCiOptions, values: Record<string, boolean>) {
  const filename = getReleaseEnv(options)['GITHUB_OUTPUT']
  if (filename) {
    await appendFile(filename, `${Object.entries(values).map(([key, value]) => `${key}=${value}`).join('\n')}\n`)
  }
}

export async function reportStage(receipt: StageReceipt, options: ReleaseCiOptions, stage: ReleaseCiStage, started: number, status: 'complete' | 'failed', progressCwd = options.cwd) {
  let accepted: PublishedPackage[] = []
  let targets = receipt.candidates
  try {
    const progress = JSON.parse(await readFile(path.join(progressCwd, 'repoctl-publish-progress.json'), 'utf8')) as { candidates?: PublishedPackage[], acceptedPackages?: PublishedPackage[], confirmedPackages?: PublishedPackage[] }
    targets = progress.candidates ?? targets
    accepted = stage === 'confirm' ? progress.confirmedPackages ?? [] : progress.acceptedPackages ?? []
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      logger.warn('Could not read publish progress for stage summary; durable checkpoint is preserved')
    }
  }
  const pending = ['upload', 'confirm', 'finalize'].includes(stage) && receipt.publish
    ? targets.filter(pkg => !accepted.some(item => packageKey(item) === packageKey(pkg))).map(packageKey)
    : []
  const elapsedMs = Math.round(performance.now() - started)
  const count = ['upload', 'confirm'].includes(stage) ? accepted.length : targets.length
  receipt.stages.push({ stage, elapsedMs, status, count, pending })
  logger.info(`Release ${stage}: ${status}; ${(elapsedMs / 1_000).toFixed(2)}s; completed ${count}; pending ${pending.join(', ') || '(none)'}`)
  const summary = getReleaseEnv(options)['GITHUB_STEP_SUMMARY']
  if (summary) {
    await appendFile(summary, `### Release ${stage}\n\n- Status: ${status}\n- Duration: ${(elapsedMs / 1_000).toFixed(2)}s\n- Completed: ${count}\n- Pending: ${pending.join(', ') || '(none)'}\n\n`)
  }
  await saveReceipt(receipt, options)
}
