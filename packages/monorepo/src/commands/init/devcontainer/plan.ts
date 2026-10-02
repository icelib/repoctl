import type { DevContainerOptions, DevContainerPlan } from '../../../types/devcontainer'
import { realpath } from 'node:fs/promises'
import { findWorkspaceDir } from '@pnpm/find-workspace-dir'
import path from 'pathe'
import { satisfies, valid, validRange } from 'semver'
import { fileDiff } from '../../upgrade/plan/diff'
import { hash, readOptional } from './files'
import { devContainerFiles } from './templates'

const supportedNodes = ['24.21.0', '22.23.3']

export async function planDevContainer(cwd: string, options: DevContainerOptions = {}): Promise<DevContainerPlan> {
  const workspace = await findWorkspaceDir(cwd)
  if (!workspace) {
    throw new Error('Dev Container presets require an existing pnpm workspace root.')
  }
  const root = path.resolve(await realpath(workspace))
  const inputs: DevContainerPlan['inputs'] = []
  let source: Awaited<ReturnType<typeof readOptional>> = null
  for (const relative of ['package.json', 'pnpm-workspace.yaml', '.devcontainer.json']) {
    const content = await readOptional(root, relative)
    inputs.push({ path: relative, hash: content === null ? null : hash(content) })
    if (relative === 'package.json') {
      source = content
    }
  }
  if (source === null) {
    throw new Error('Dev Container presets require a root package.json.')
  }
  const manifest = JSON.parse(source.toString('utf8')) as { engines?: { node?: unknown }, packageManager?: unknown }
  const nodeRange = manifest.engines?.node
  if (typeof nodeRange !== 'string' || !validRange(nodeRange)) {
    throw new Error('Declare a valid root engines.node range before planning a Dev Container.')
  }
  const nodeVersion = options.nodeVersion ?? supportedNodes.find(version => satisfies(version, nodeRange))
  if (!nodeVersion || !/^\d+\.\d+\.\d+$/u.test(nodeVersion) || valid(nodeVersion) !== nodeVersion || !satisfies(nodeVersion, '>=22.13.0') || !satisfies(nodeVersion, nodeRange)) {
    throw new Error(`Choose an exact stable --node-version >=22.13.0 allowed by engines.node (${nodeRange}).`)
  }
  const packageManager = manifest.packageManager
  if (typeof packageManager !== 'string' || !/^pnpm@\d+\.\d+\.\d+(?:\+sha(?:224|256|384|512)\.[a-f\d]+)?$/u.test(packageManager) || !valid(packageManager.slice(5).split('+')[0])) {
    throw new Error('Root packageManager must pin an exact stable pnpm version, optionally with a Corepack integrity hash.')
  }
  const blockers: string[] = []
  if (inputs.find(input => input.path === '.devcontainer.json')?.hash) {
    blockers.push('An existing root .devcontainer.json takes precedence; preserve it and review the proposed preset manually.')
  }
  const files: DevContainerPlan['files'] = []
  for (const [relative, content] of await devContainerFiles(nodeVersion)) {
    const before = await readOptional(root, relative)
    const beforeHash = before === null ? null : hash(before)
    const afterHash = hash(content)
    const action = beforeHash === null ? 'create' : beforeHash === afterHash ? 'unchanged' : 'preserve'
    files.push({ path: relative, action, beforeHash, afterHash, content, diff: fileDiff(relative, before, new TextEncoder().encode(content)).diff })
    if (action === 'preserve') {
      blockers.push(`Existing file will be preserved: ${relative}`)
    }
  }
  files.sort((left, right) => left.path.localeCompare(right.path))
  const payload = {
    schemaVersion: 1 as const,
    kind: 'devcontainer' as const,
    workspaceDir: root,
    status: blockers.length ? 'blocked' as const : 'ready' as const,
    nodeVersion,
    nodeRange,
    packageManager,
    image: `node:${nodeVersion}-bookworm`,
    inputs,
    files,
    blockers,
  }
  return { ...payload, fingerprint: hash(JSON.stringify(payload)) }
}
