import type { PublishedPackage, ReleaseCiOptions, ReleaseMode, ReleaseOptions } from './types'
import { spawnSync } from 'node:child_process'
import { access, readFile, rm } from 'node:fs/promises'
import process from 'node:process'
import path from 'pathe'
import YAML from 'yaml'
import { getWorkspaceData } from '../../core/workspace'
import { ReleaseCommandError } from './errors'
import { readPendingIntents } from './intents'

export function getReleaseEnv(options: ReleaseOptions) {
  return options.env ?? process.env
}

/** CLI 预检与发布调度共享模式优先级，确保核验入口不加载可执行配置。 */
export function resolveReleaseMode(options: Pick<ReleaseCiOptions, 'mode' | 'env'>): ReleaseMode {
  const requested = options.mode && options.mode !== 'auto'
    ? options.mode
    : (options.env ?? process.env)['REPO_RELEASE_MODE']?.trim() as ReleaseMode | undefined
  return requested && requested !== 'auto' ? requested : 'auto'
}

export function run(command: string, args: string[], options: ReleaseOptions) {
  const result = (options.spawn ?? spawnSync)(command, args, {
    cwd: options.cwd,
    encoding: 'utf8',
    env: getReleaseEnv(options),
    shell: false,
    stdio: 'inherit',
  })

  if (result.status !== 0) {
    throw new ReleaseCommandError(`command failed: ${command} ${args.join(' ')}`, result.status ?? 1)
  }
}

export function capture(command: string, args: string[], options: ReleaseOptions) {
  const result = (options.spawn ?? spawnSync)(command, args, {
    cwd: options.cwd,
    encoding: 'utf8',
    env: getReleaseEnv(options),
    shell: false,
    stdio: ['ignore', 'pipe', 'inherit'],
  })

  if (result.status !== 0) {
    throw new ReleaseCommandError(`command failed: ${command} ${args.join(' ')}`, result.status ?? 1)
  }

  return result.stdout?.toString().trim() ?? ''
}

export function hasGitChanges(options: ReleaseOptions) {
  return (options.spawn ?? spawnSync)('git', ['diff', '--quiet', '--exit-code'], {
    cwd: options.cwd,
    encoding: 'utf8',
    shell: false,
    stdio: 'ignore',
  }).status !== 0
}

export async function hasPendingIntents(cwd: string) {
  return (await readPendingIntents(cwd)).length > 0
}

export function resolveBranch(options: ReleaseOptions) {
  return options.branch?.trim() || getReleaseEnv(options)['GITHUB_REF_NAME']?.trim() || capture('git', ['rev-parse', '--abbrev-ref', 'HEAD'], options)
}

export async function getPublishablePackageNames(cwd: string) {
  const { packages } = await getWorkspaceData(cwd)
  const names = packages
    .map(pkg => pkg.manifest.name)
    .filter((name): name is string => Boolean(name))
  if (!names.length) {
    throw new ReleaseCommandError('no publishable workspace packages were found')
  }
  return names
}

function packageFilters(names: string[]) {
  return names.flatMap(name => ['--filter', name])
}

export async function runLane(lane: string, options: ReleaseOptions) {
  const names = await getPublishablePackageNames(options.cwd)
  run('pnpm', ['lane', lane, ...packageFilters(names)], options)
}

export async function readLaneAssignments(cwd: string) {
  try {
    const workspaceFile = await readFile(path.join(cwd, 'pnpm-workspace.yaml'), 'utf8')
    const manifest = YAML.parse(workspaceFile) as { versioning?: { lanes?: Record<string, string> } }
    return manifest.versioning?.lanes ?? {}
  }
  catch {
    return {}
  }
}

export async function assertLaneAssignments(lane: string, options: ReleaseOptions) {
  const names = await getPublishablePackageNames(options.cwd)
  const assignments = await readLaneAssignments(options.cwd)
  const mismatched = names.filter(name => assignments[name] !== lane)
  if (mismatched.length) {
    throw new ReleaseCommandError([
      `all publishable packages must be on the ${lane} lane before prerelease publishing`,
      `mismatched packages: ${mismatched.join(', ')}`,
      `Run \`repo release pre enter ${lane}\`, commit pnpm-workspace.yaml, and push again.`,
    ].join('\n'))
  }
}

export async function assertStableLaneAssignments(options: ReleaseOptions) {
  const assignments = await readLaneAssignments(options.cwd)
  const active = Object.entries(assignments).filter(([, lane]) => lane !== 'main')
  if (active.length) {
    throw new ReleaseCommandError(`stable releases require all packages on the main lane, found ${active.map(([name, lane]) => `${name}:${lane}`).join(', ')}`)
  }
}

export async function clearPublishSummary(cwd: string) {
  await rm(path.join(cwd, 'pnpm-publish-summary.json'), { force: true })
}

export function parsePublishSummary(content: string): PublishedPackage[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  }
  catch {
    throw new ReleaseCommandError('pnpm-publish-summary.json is not valid JSON')
  }

  if (!parsed || typeof parsed !== 'object' || !Array.isArray((parsed as { publishedPackages?: unknown }).publishedPackages)) {
    throw new ReleaseCommandError('pnpm-publish-summary.json does not contain publishedPackages')
  }

  return (parsed as { publishedPackages: unknown[] }).publishedPackages.map((item) => {
    if (!item || typeof item !== 'object' || typeof (item as { name?: unknown }).name !== 'string' || typeof (item as { version?: unknown }).version !== 'string') {
      throw new ReleaseCommandError('pnpm-publish-summary.json contains an invalid package entry')
    }
    return {
      name: (item as { name: string }).name,
      version: (item as { version: string }).version,
    }
  })
}

export async function readPublishSummary(cwd: string) {
  const summaryPath = path.join(cwd, 'pnpm-publish-summary.json')
  try {
    await access(summaryPath)
    return parsePublishSummary(await readFile(summaryPath, 'utf8'))
  }
  catch (error) {
    if (error instanceof ReleaseCommandError) {
      throw error
    }
    return []
  }
}
