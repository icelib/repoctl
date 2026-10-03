import type { DependencyOccurrence } from '../../types/dependencies'
import { access, realpath } from 'node:fs/promises'
import { findWorkspaceDir } from '@pnpm/find-workspace-dir'
import { findWorkspacePackages } from '@pnpm/workspace.find-packages'
import path from 'pathe'
import YAML from 'yaml'
import { getRepoctlConfigCandidates, loadMonorepoConfigDetails } from '../../core/config'
import { resolveCommandValues } from '../../core/config/resolution'
import { localize } from '../../i18n'
import { hash, readInput, record } from './files'
import { dependencySections, validatePolicy } from './policy'
import { parseSpecifier } from './specifiers'

export async function scanDependencies(cwd: string, options: { policy?: boolean } = {}) {
  const found = await findWorkspaceDir(cwd)
  if (!found) {
    throw new Error(localize('Dependency checks require a pnpm workspace.', '依赖检查需要 pnpm 工作区。'))
  }
  const workspaceDir = path.resolve(await realpath(found))
  const contents = new Map<string, string>()
  const workspaceContent = await readInput(workspaceDir, 'pnpm-workspace.yaml')
  contents.set('pnpm-workspace.yaml', workspaceContent)
  const workspace = record(YAML.parse(workspaceContent)) ?? {}
  const patterns = workspace['packages']
  if (patterns !== undefined && (!Array.isArray(patterns) || patterns.some(value => typeof value !== 'string'))) {
    throw new Error(localize('Invalid workspace package patterns.', '工作区包匹配规则无效。'))
  }
  const packages = await findWorkspacePackages(workspaceDir, patterns ? { patterns } : {})
  for (const candidate of getRepoctlConfigCandidates(workspaceDir)) {
    try {
      await access(candidate)
    }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        continue
      }
      throw error
    }
    const relative = path.relative(workspaceDir, candidate)
    contents.set(relative, await readInput(workspaceDir, relative))
  }
  const loaded = options.policy === false ? undefined : await loadMonorepoConfigDetails(workspaceDir, { refresh: true })
  for (const file of loaded?.files ?? []) {
    const relative = path.relative(workspaceDir, file)
    if (!contents.has(relative)) {
      contents.set(relative, await readInput(workspaceDir, relative))
    }
  }
  const policy = loaded ? validatePolicy(resolveCommandValues('deps', loaded.config.commands?.deps ?? {}).values) : []
  const occurrences: DependencyOccurrence[] = []
  const manifests = [...new Set(['package.json', ...packages.map(pkg => path.relative(workspaceDir, path.join(pkg.rootDir, 'package.json')))])].sort()
  for (const relative of manifests) {
    const content = await readInput(workspaceDir, relative)
    contents.set(relative, content)
    const manifest = record(JSON.parse(content))
    if (!manifest) {
      throw new Error(localize(`Invalid manifest: ${relative}`, `清单无效：${relative}`))
    }
    for (const section of dependencySections) {
      const dependencies = record(manifest[section])
      if (manifest[section] !== undefined && !dependencies) {
        throw new Error(localize(`Invalid dependency map: ${relative} ${section}`, `依赖声明无效：${relative} ${section}`))
      }
      for (const [name, value] of Object.entries(dependencies ?? {}).sort(([a], [b]) => a.localeCompare(b))) {
        if (typeof value !== 'string') {
          throw new TypeError(localize(`Invalid dependency specifier: ${relative} ${section}.${name}`, `依赖版本声明无效：${relative} ${section}.${name}`))
        }
        occurrences.push({ name, section, path: relative, workspace: path.dirname(relative), packageName: typeof manifest['name'] === 'string' ? manifest['name'] : null, specifier: value, ...parseSpecifier(name, value, workspace) })
      }
    }
  }
  const inputs = [...contents].sort(([a], [b]) => a.localeCompare(b)).map(([file, content]) => ({ path: file, hash: hash(content) }))
  return { workspaceDir, workspace, occurrences, policy, inputs, contents }
}

export type DependencyScan = Awaited<ReturnType<typeof scanDependencies>>
