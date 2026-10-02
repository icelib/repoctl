import type { UpgradeContext } from './context'
import { Buffer } from 'node:buffer'
import { findWorkspacePackages } from '@pnpm/workspace.find-packages'
import path from 'pathe'
import YAML from 'yaml'
import { normalizeWorkspaceManifest } from '../workspace'

/** Plan both lane changes and legacy metadata removals before any asset is applied. */
export async function planVersioningMigration(context: UpgradeContext) {
  const { plan, read, put, options } = context
  const pre = await read('target', '.changeset/pre.json')
  const config = await read('target', '.changeset/config.json')
  if (pre === null && config === null) {
    return
  }
  const group = 'legacy-versioning'
  const preserve = options.noOverwrite || options.skipOverwrite
  if (preserve) {
    for (const [filename, content] of [['.changeset/pre.json', pre], ['.changeset/config.json', config]] as const) {
      if (content !== null) {
        await put(filename, content, 'overwrite-disabled', 'Legacy metadata is protected by no-overwrite.', { skip: true })
      }
    }
    return
  }
  if (pre !== null) {
    let tag: string | undefined
    try {
      const state = JSON.parse(pre.toString()) as { mode?: string, tag?: string }
      if (state.mode === 'pre' && typeof state.tag === 'string' && state.tag.trim()) {
        tag = state.tag
      }
    }
    catch { /* Unrecognized state remains available for manual migration. */ }
    const workspace = plan.files.find(file => file.path === 'pnpm-workspace.yaml')
    const current = await read('target', 'pnpm-workspace.yaml')
    if (!tag || (workspace?.status === 'skip') || (current === null && !workspace?.content)) {
      await put('.changeset/pre.json', pre, 'prerelease-state-retained', 'Unrecognized prerelease state or protected workspace configuration requires manual migration.', { skip: true })
      if (config !== null) {
        await put('.changeset/config.json', config, 'prerelease-state-retained', 'Retain the legacy configuration until prerelease migration is possible.', { skip: true })
      }
      return
    }
    const content = workspace?.content ? Buffer.from(workspace.content, 'base64') : current!
    const manifest = normalizeWorkspaceManifest(YAML.parse(content.toString()))
    const versioning = normalizeWorkspaceManifest(manifest['versioning'])
    const lanes = normalizeWorkspaceManifest(versioning['lanes'])
    const patterns = manifest.packages
    const packages = await findWorkspacePackages(plan.rootDir, patterns ? { patterns } : {})
    plan.discovery = { patterns: patterns ?? null, manifests: packages.map(pkg => path.relative(plan.rootDir, path.join(path.resolve(pkg.rootDir), 'package.json'))).sort() }
    for (const pkg of packages) {
      const relative = path.relative(plan.rootDir, path.resolve(pkg.rootDir))
      await read('target', relative ? `${relative}/package.json` : 'package.json')
      if (!relative || pkg.manifest.private || !pkg.manifest.name) {
        continue
      }
      lanes[pkg.manifest.name] = tag
    }
    versioning['lanes'] = lanes
    manifest['versioning'] = versioning
    await put('pnpm-workspace.yaml', Buffer.from(YAML.stringify(manifest, { singleQuote: true })), 'legacy-lane-migration', 'Merge workspace settings and migrate the Changesets prerelease tag to pnpm lanes.', { group })
    await put('.changeset/pre.json', null, 'legacy-pre-migrated', 'Remove prerelease metadata only with the planned lane migration.', { group })
  }
  if (config !== null) {
    await put('.changeset/config.json', null, 'legacy-config-removal', 'Remove configuration that belongs to the replaced Changesets CLI.', { group })
  }
  for (const file of plan.files) {
    if (['package.json', '.github/workflows/release.yml'].includes(file.path) && ['add', 'modify'].includes(file.status)) {
      file.group = group
    }
  }
}
