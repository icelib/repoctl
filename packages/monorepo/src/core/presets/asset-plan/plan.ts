import type { OrganizationPresetAssetPlan } from './types'
import { Buffer } from 'node:buffer'
import { readFile } from 'node:fs/promises'
import { findWorkspaceDir } from '@pnpm/find-workspace-dir'
import { mergeRootAsset } from '../../../commands/upgrade/baseline/merge'
import { baselinePath as rootBaselinePath } from '../../../commands/upgrade/baseline/record'
import { fileDiff } from '../../../commands/upgrade/plan/diff'
import { loadMonorepoConfigDetails } from '../../config'
import { canonicalDirectory, hash, readOptional } from '../../file-transaction/paths'
import { readPresetFile } from '../files'
import { encodePresetBaseline, parsePresetBaseline, presetBaselinePath } from './baseline'

/** Inspection is read-only. Applying this plan is the only preset asset write entrypoint. */
export async function planOrganizationPresetAssets(cwd: string): Promise<OrganizationPresetAssetPlan> {
  const rootDir = await canonicalDirectory(await findWorkspaceDir(cwd) ?? cwd)
  const loaded = await loadMonorepoConfigDetails(rootDir, { refresh: true })
  const inputs = new Map(loaded.presets.inputs.map(input => [input.path, input.hash]))
  for (const filename of loaded.files) {
    const current = hash(await readFile(filename))
    if (inputs.has(filename) && inputs.get(filename) !== current) {
      throw new Error('Preset input changed while planning')
    }
    inputs.set(filename, current)
  }
  const plan: OrganizationPresetAssetPlan = { schemaVersion: 1, kind: 'organization-preset-assets', rootDir, status: 'unchanged', sources: loaded.presets.layers.map(layer => layer.source), inputs: [], locations: loaded.presets.locations, ownership: [], files: [], conflicts: [] }
  const owners = new Map<string, string>()
  for (const layer of loaded.presets.layers) {
    for (const asset of layer.manifest.assets ?? []) {
      if (owners.has(asset.target)) {
        plan.conflicts.push({ path: asset.target, reason: `Multiple presets claim this target: ${owners.get(asset.target)} and ${layer.source.packageName}` })
        continue
      }
      owners.set(asset.target, layer.source.packageName)
      const upstream = await readPresetFile(layer.source.directory, asset.source)
      inputs.set(upstream.filename, upstream.hash)
      const before = await readOptional(rootDir, asset.target)
      const baselineFile = presetBaselinePath(asset.target)
      const baselineContent = await readOptional(rootDir, baselineFile)
      const baseline = baselineContent ? parsePresetBaseline(baselineContent, baselineFile) : null
      const rootOwnerPath = rootBaselinePath(asset.target)
      const rootOwner = await readOptional(rootDir, rootOwnerPath)
      plan.ownership.push({ path: rootOwnerPath, hash: rootOwner ? hash(rootOwner) : null })
      let reason = 'preset-asset-added'
      let after: Buffer | null = upstream.content
      let merge: ReturnType<typeof mergeRootAsset>['details'] | undefined
      if (rootOwner !== null) {
        reason = 'Asset belongs to the repoctl root provider; transfer ownership explicitly before adopting it.'
        after = null
      }
      else if (baseline && baseline.source.packageName !== layer.source.packageName) {
        reason = `Asset belongs to another preset: ${baseline.source.packageName}`
        after = null
      }
      else if (before !== null && !baseline) {
        reason = 'Existing file has no preset baseline; preserve it and choose an unowned target.'
        after = null
      }
      else if (before === null && baseline) {
        reason = 'Locally deleted preset asset is preserved; restore it explicitly before upgrading.'
        after = null
      }
      else if (before && baseline) {
        const merged = mergeRootAsset(Buffer.from(baseline.upstream.content, 'base64'), before, upstream.content)
        after = merged.content
        reason = merged.reason
        merge = merged.details
      }
      const beforeHash = before ? hash(before) : null
      const file: OrganizationPresetAssetPlan['files'][number] = {
        path: asset.target,
        source: { packageName: layer.source.packageName, version: layer.source.version, path: asset.source },
        status: after === null ? 'conflict' : beforeHash === hash(after) ? 'identical' : before === null ? 'add' : 'modify',
        beforeHash,
        afterHash: after ? hash(after) : beforeHash,
        content: after?.toString('base64') ?? null,
        diff: fileDiff(asset.target, before, after ?? upstream.content).diff,
        reason,
        ...(merge ? { merge } : {}),
      }
      if (after === null) {
        plan.conflicts.push({ path: asset.target, reason })
      }
      else {
        const next = encodePresetBaseline(asset, layer.source, upstream.content)
        file.baseline = { path: baselineFile, beforeHash: baselineContent ? hash(baselineContent) : null, afterHash: hash(next), content: next.toString('base64') }
      }
      plan.files.push(file)
    }
  }
  plan.inputs = [...inputs].map(([filename, hash]) => ({ path: filename, hash })).sort((a, b) => a.path.localeCompare(b.path))
  plan.files.sort((a, b) => a.path.localeCompare(b.path))
  plan.ownership.sort((a, b) => a.path.localeCompare(b.path))
  plan.status = plan.conflicts.length ? 'blocked' : plan.files.some(file => file.status !== 'identical' || file.baseline?.beforeHash !== file.baseline?.afterHash) ? 'ready' : 'unchanged'
  return plan
}
