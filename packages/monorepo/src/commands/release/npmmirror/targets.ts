import type { NpmMirrorSyncOptions, SyncTarget } from './types'
import { readFile } from 'node:fs/promises'
import { valid } from 'semver'
import { getWorkspaceData } from '../../../core/workspace'
import { parsePublishSummary } from '../shared'
import { sourceRegistry, validatePackageName } from './http'

export function validateOptions(options: NpmMirrorSyncOptions) {
  if ([options.published, options.all, options.packageName !== undefined].filter(Boolean).length !== 1) {
    throw new Error('Choose exactly one of --published, --all or --package <name>')
  }
  if (options.version !== undefined && options.packageName === undefined) {
    throw new Error('--version requires --package')
  }
  const timeout = options.timeout ?? 300
  if (!Number.isFinite(timeout) || timeout <= 0) {
    throw new Error('--timeout must be a positive number of seconds')
  }
  if (options.packageName !== undefined) {
    validatePackageName(options.packageName)
  }
  if (options.version !== undefined && valid(options.version) !== options.version) {
    throw new Error(`Invalid npm version: ${options.version}`)
  }
  return timeout
}

/** 发布结果是自动同步的唯一目标来源，不回退扫描整仓或旧摘要。 */
export async function selectTargets(options: NpmMirrorSyncOptions): Promise<SyncTarget[]> {
  if (options.packageName !== undefined) {
    return [{ name: options.packageName, versions: options.version === undefined ? [] : [options.version] }]
  }
  if (options.all) {
    const { packages } = await getWorkspaceData(options.cwd)
    const names = packages.flatMap(({ manifest }) => {
      if (!manifest.name) {
        return []
      }
      const publishConfig = (manifest as typeof manifest & { publishConfig?: { registry?: string } }).publishConfig
      if (publishConfig?.registry
        && publishConfig.registry.replace(/\/$/u, '') !== sourceRegistry) {
        return []
      }
      return [manifest.name]
    })
    for (const name of names) {
      validatePackageName(name)
    }
    return [...new Set(names)].sort().map(name => ({ name, versions: [] }))
  }

  const value = options.env?.['REPO_RELEASE_PUBLISHED_PACKAGES']
  const summaryPath = options.env?.['REPO_RELEASE_PUBLISH_SUMMARY']
  let packages
  if (value?.trim()) {
    let parsed: unknown
    try {
      parsed = JSON.parse(value)
    }
    catch {
      throw new Error('REPO_RELEASE_PUBLISHED_PACKAGES is not valid JSON')
    }
    packages = parsePublishSummary(JSON.stringify({ publishedPackages: parsed }))
  }
  else if (summaryPath?.trim()) {
    packages = parsePublishSummary(await readFile(summaryPath, 'utf8'))
  }
  else {
    throw new Error('--published requires REPO_RELEASE_PUBLISHED_PACKAGES or REPO_RELEASE_PUBLISH_SUMMARY')
  }

  const grouped = new Map<string, Set<string>>()
  for (const { name, version } of packages) {
    validatePackageName(name)
    if (valid(version) !== version) {
      throw new Error(`Invalid npm version: ${version}`)
    }
    if (!grouped.has(name)) {
      grouped.set(name, new Set())
    }
    grouped.get(name)!.add(version)
  }
  return [...grouped].map(([name, versions]) => ({ name, versions: [...versions] }))
}
