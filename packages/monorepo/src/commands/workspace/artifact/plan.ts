import type { WorkspaceArtifactOptions, WorkspaceArtifactPlan } from '../../../types/artifact'
import { readFile, realpath } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { isDeepStrictEqual } from 'node:util'
import path from 'pathe'
import { valid } from 'semver'
import { getWorkspaceGraph, resolveWorkspaceGraphNode } from '../../../core/workspace-graph'
import { discoverCleanWorkspace } from '../../clean/discovery'
import { nativeTool } from './native'
import { destination, inside, relativeArtifactPath } from './paths'
import { fingerprint, inventory } from './tree'

function options(input: WorkspaceArtifactOptions) {
  if (!input || typeof input.target !== 'string' || !input.target || !['prune', 'deploy'].includes(input.mode)
    || typeof input.output !== 'string' || Object.keys(input).some(key => !['target', 'mode', 'output', 'entry', 'docker', 'offline', 'legacy'].includes(key))
    || ['docker', 'offline', 'legacy'].some(key => input[key as 'docker'] !== undefined && typeof input[key as 'docker'] !== 'boolean')
    || (input.entry !== undefined && typeof input.entry !== 'string')) {
    throw new Error('Artifact preparation requires one exact target, mode prune/deploy and an explicit output directory.')
  }
  if ((input.mode === 'prune' && (input.entry !== undefined || input.offline || input.legacy)) || (input.mode === 'deploy' && input.docker)) {
    throw new Error('--docker belongs to prune; --entry, --offline and --legacy belong to deploy.')
  }
}

export async function buildArtifactPlan(cwd: string, input: WorkspaceArtifactOptions): Promise<WorkspaceArtifactPlan> {
  options(input)
  const root = (await discoverCleanWorkspace(cwd)).workspaceDir
  if (inside(root, path.resolve(await realpath(tmpdir())))) {
    throw new Error('Artifact staging requires a temporary directory outside the source workspace.')
  }
  const graph = await getWorkspaceGraph(root, { ignorePrivatePackage: false, ignoreRootPackage: false })
  const target = resolveWorkspaceGraphNode(graph, input.target)
  if (target.id === '.' || !target.name || !/^(?:@[a-z0-9~][a-z0-9._~-]*\/)?[a-z0-9~][a-z0-9._~-]*$/u.test(target.name)
    || graph.nodes.filter(node => node.name === target.name).length !== 1) {
    throw new Error('Artifact preparation requires one uniquely named, non-root workspace package with a valid npm name.')
  }
  const output = (await destination(root, input.output)).output
  const selection: WorkspaceArtifactOptions = { target: `./${target.id}`, mode: input.mode, output, ...(input.entry ? { entry: input.entry } : {}), ...(input.docker ? { docker: true } : {}), ...(input.offline ? { offline: true } : {}), ...(input.legacy ? { legacy: true } : {}) }
  const snapshot = await inventory(root, true)
  if (!snapshot.files.some(file => file.path === 'pnpm-lock.yaml' && file.kind === 'file')) {
    throw new Error('A pnpm lockfile is required. Install and build the source workspace explicitly first.')
  }
  const manifest = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8')) as { packageManager?: string }
  const declared = manifest.packageManager?.match(/^pnpm@([^+]+)(?:\+sha\d+\.[a-f\d]+)?$/u)?.[1]
  if (!declared || !valid(declared)) {
    throw new Error('Root packageManager must pin an exact pnpm version.')
  }
  let entry: string | null = null
  if (input.mode === 'deploy') {
    const pkg = JSON.parse(await readFile(path.join(root, target.id, 'package.json'), 'utf8')) as { main?: unknown, bin?: unknown }
    const bins = typeof pkg.bin === 'string' ? [pkg.bin] : pkg.bin && typeof pkg.bin === 'object' ? Object.values(pkg.bin) : []
    const value = input.entry ?? pkg.main ?? (bins.length === 1 ? bins[0] : undefined)
    if (typeof value !== 'string' || !value) {
      throw new Error('Deploy requires --entry <built-runtime-file>, package.main or exactly one bin. Arbitrary start scripts are not evaluated.')
    }
    entry = relativeArtifactPath(value.replace(/^\.\//u, ''))
    if (!snapshot.files.some(file => file.path === `${target.id}/${entry}` && file.kind === 'file')) {
      throw new Error(`Built deploy entry is missing or excluded: ${target.id}/${entry}. Build the source workspace first.`)
    }
  }
  const tool = await nativeTool(root, input.mode, declared)
  if (!isDeepStrictEqual(await inventory(root, true), snapshot)) {
    throw new Error('Source inputs changed while preparing the artifact plan.')
  }
  const candidates = new Set([target.id])
  let changed = true
  while (changed) {
    changed = false
    for (const edge of graph.edges) {
      if (candidates.has(edge.source) && (input.mode === 'prune' || edge.type !== 'devDependencies') && !candidates.has(edge.target)) {
        candidates.add(edge.target)
        changed = true
      }
    }
  }
  const args = input.mode === 'prune'
    ? [...tool.prefix, 'prune', target.name, '--out-dir', '<output>', '--use-gitignore=true', ...(input.docker ? ['--docker'] : [])]
    : [...tool.prefix, '--filter', target.name, 'deploy', '--prod', '--ignore-scripts', '--frozen-lockfile', ...(input.offline ? ['--offline'] : []), ...(input.legacy ? ['--legacy'] : []), '<output>']
  const plan = {
    schemaVersion: 1 as const,
    kind: 'workspace-artifact' as const,
    workspaceDir: root,
    selection,
    target: { id: target.id, name: target.name },
    packageManager: declared,
    tool,
    command: { executable: tool.executable, args },
    inputs: snapshot.files,
    excluded: snapshot.excluded,
    entry,
    manifestCandidates: [...candidates].sort(),
    notes: [
      'Dependency resolution and package selection are performed by native Turbo/pnpm; manifest candidates are advisory.',
      'Native commands run in an isolated source copy. node_modules, Git/operation/cache storage, real env files and authentication files are excluded before copying; .env.example and .env.sample remain.',
      'Deploy uses production dependencies with lifecycle scripts and pnpmfile hooks disabled; injectWorkspacePackages and peer compatibility follow the pinned pnpm version.',
      'Build source artifacts explicitly first. No runtime command, cloud deployment, container publishing or source lockfile update is performed.',
      'Files are published exclusively and the receipt commits last. Incomplete outputs require review; concurrent files are preserved during recovery.',
    ],
  }
  return { ...plan, fingerprint: fingerprint(plan) }
}
