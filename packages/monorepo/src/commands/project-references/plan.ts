import type { ProjectReferencesOperation, ProjectReferencesPlan } from '../../types'
import { Buffer } from 'node:buffer'
import { readFile, realpath } from 'node:fs/promises'
import path from 'pathe'
import { glob } from 'tinyglobby'
import { loadMonorepoConfigDetails } from '../../core/config'
import { clearWorkspaceCache, getWorkspaceData } from '../../core/workspace'
import { hash, record } from '../deps/files'
import { fileDiff } from '../upgrade/plan/diff'
import { configReader, loadCompiler, validateGraph } from './compiler'
import { compare, exists, ownershipFile, readText, referenceTarget } from './files'
import { readOwnership, reconcile, renderReferences } from './ownership'
import { parseSettings, validateLayers } from './settings'

function operation(file: string, before: string | null, after: string): ProjectReferencesOperation {
  return { path: file, before, after, beforeHash: before === null ? null : hash(before), afterHash: hash(after), diff: fileDiff(file, before === null ? null : Buffer.from(before), Buffer.from(after)).diff }
}

/** Inspect existing references without opt-in, or preview explicitly enabled managed discovery. */
export async function planProjectReferences(cwd: string): Promise<ProjectReferencesPlan> {
  clearWorkspaceCache()
  const data = await getWorkspaceData(cwd, { ignorePrivatePackage: false })
  const workspaceDir = path.normalize(await realpath(data.workspaceDir))
  const loaded = await loadMonorepoConfigDetails(workspaceDir, { refresh: true })
  validateLayers(loaded.rawLayers)
  const settings = parseSettings(loaded.config.tooling?.projectReferences)
  const plan: ProjectReferencesPlan = {
    schemaVersion: 1,
    workspaceDir,
    enabled: settings.enabled === true,
    root: settings.root ?? 'tsconfig.json',
    action: 'disabled',
    projects: [],
    diagnostics: [],
    operations: [],
    inputs: {},
    validation: [],
  }
  for (const file of loaded.files) {
    plan.inputs[`configuration:${file}`] = hash(await readFile(file, 'utf8'))
  }
  plan.inputs['settings'] = hash(JSON.stringify(settings))
  if (await exists(workspaceDir, 'pnpm-workspace.yaml')) {
    await readText(workspaceDir, 'pnpm-workspace.yaml', plan.inputs)
  }
  const packages = data.packages.map(pkg => ({ ...pkg, relative: path.relative(workspaceDir, pkg.rootDir) })).sort((a, b) => compare(a.relative, b.relative))
  for (const pkg of packages) {
    await readText(workspaceDir, `${pkg.relative}/package.json`, plan.inputs)
  }
  const patterns = settings.projects ?? packages.map(pkg => `${pkg.relative}/tsconfig.json`)
  const candidates = patterns.length
    ? await glob(patterns, {
        cwd: workspaceDir,
        onlyFiles: true,
        followSymbolicLinks: false,
        ignore: ['**/node_modules/**', '**/.git/**', '**/dist/**', '.repoctl/**', ...(settings.exclude ?? [])],
      })
    : []
  if (plan.enabled) {
    plan.projects = candidates.filter(file => file !== plan.root && packages.some(pkg => file.startsWith(`${pkg.relative}/`))).sort(compare)
    for (const pattern of settings.projects ?? []) {
      const matched = await glob([pattern], { cwd: workspaceDir, onlyFiles: true, followSymbolicLinks: false, ignore: ['**/node_modules/**', '**/.git/**', '**/dist/**', '.repoctl/**'] })
      if (!matched.some(file => file !== plan.root && packages.some(pkg => file.startsWith(`${pkg.relative}/`)))) {
        plan.diagnostics.push({ code: 'unselected', path: pattern, message: `Project pattern does not match a workspace package configuration: ${pattern}` })
      }
    }
  }
  plan.inputs['discovery'] = hash(JSON.stringify({ packages: packages.map(pkg => pkg.relative), projects: plan.projects }))
  const ts = loadCompiler(workspaceDir)
  plan.inputs['typescript:version'] = ts.version
  const read = configReader(workspaceDir, ts, plan.inputs, plan.diagnostics)
  const { original: ownershipBefore, state } = await readOwnership(workspaceDir, plan.inputs)
  const projected = new Map<string, Array<{ path: string }>>()
  const desired = new Map<string, string[]>([[plan.root, plan.projects]])
  for (const project of plan.projects) {
    desired.set(project, [])
  }
  for (const edge of settings.relations ?? []) {
    if (!plan.projects.includes(edge.source) || !plan.projects.includes(edge.target)) {
      plan.diagnostics.push({ code: 'unselected', path: edge.source, message: `Compilation relation must connect two selected projects: ${edge.source} -> ${edge.target}` })
      continue
    }
    desired.get(edge.source)!.push(edge.target)
  }
  const configs: Record<string, string[]> = {}
  if (plan.enabled) {
    for (const file of [...new Set([...desired.keys(), ...Object.keys(state.configs)])].sort(compare)) {
      // A deleted managed source no longer needs a registry entry or a write.
      if (!desired.has(file) && !await exists(workspaceDir, file)) {
        continue
      }
      const config = await read(file)
      if (!config) {
        continue
      }
      try {
        for (const ref of config.references) {
          referenceTarget(file, ref.path)
        }
        const result = reconcile(config, state.configs[file] ?? [], desired.get(file) ?? [], plan.diagnostics)
        projected.set(file, result.references)
        if (result.managed.length) {
          configs[file] = result.managed
        }
        const after = renderReferences(ts, config, result.references)
        if (after !== config.original) {
          plan.operations.push(operation(file, config.original, after))
        }
      }
      catch (error) {
        plan.diagnostics.push({ code: 'config', path: file, message: (error as Error).message })
      }
    }
    const next = { schemaVersion: 1, configs }
    if (JSON.stringify(next) !== JSON.stringify(state)) {
      plan.operations.push(operation(ownershipFile, ownershipBefore, `${JSON.stringify(next, null, 2)}\n`))
    }
  }
  await validateGraph([...new Set([plan.root, ...projected.keys()])].sort(compare), projected, read, plan.diagnostics)
  for (const project of plan.projects) {
    const pkg = packages.filter(pkg => project.startsWith(`${pkg.relative}/`)).at(-1)!
    const script = record(record(pkg.manifest)?.['scripts'])?.['typecheck']
    plan.validation.push({ config: project, cwd: pkg.relative, command: typeof script === 'string' && script.trim() ? ['pnpm', 'run', 'typecheck'] : ['pnpm', 'exec', 'tsc', '--build', path.relative(pkg.relative, project)] })
  }
  if (!plan.validation.length) {
    plan.validation.push({ config: plan.root, cwd: '.', command: ['pnpm', 'exec', 'tsc', '--build', plan.root] })
  }
  plan.operations.sort((a, b) => compare(a.path, b.path))
  plan.diagnostics.sort((a, b) => compare(`${a.path}:${a.code}:${a.message}`, `${b.path}:${b.code}:${b.message}`))
  plan.inputs = Object.fromEntries(Object.entries(plan.inputs).sort(([a], [b]) => compare(a, b)))
  plan.action = plan.diagnostics.length ? 'blocked' : !plan.enabled ? 'disabled' : plan.operations.length ? 'update' : 'unchanged'
  return plan
}
