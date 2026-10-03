import type { UpgradeFilePlan } from '../../../types/upgrade'
import type { UpgradeContext } from '../plan/context'
import type { RootAssetBaseline } from './record'
import { Buffer } from 'node:buffer'
import { readdir } from 'node:fs/promises'
import path from 'pathe'
import { presetBaselinePath } from '../../../core/presets/asset-plan/baseline'
import { checkedFile, hash } from '../plan/files'
import { mergeRootAsset } from './merge'
import { baselineDirectory, baselinePath, encodeBaseline, isRootAsset, parseBaseline, templatePackage } from './record'

/** Baseline planning never evaluates templates or reconstructs historical code. */
export async function createBaselinePlanner(context: UpgradeContext) {
  const { plan, read, put, options } = context
  const stored = new Map<string, RootAssetBaseline>()
  const proposed = new Map<string, RootAssetBaseline | null>()
  const seen = new Set<string>()
  await checkedFile(plan.rootDir, `${baselineDirectory}/probe`)
  let names: string[] = []
  try {
    names = await readdir(path.join(plan.rootDir, baselineDirectory))
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error
    }
  }
  for (const name of names.sort()) {
    if (!name.endsWith('.json')) {
      continue
    }
    const filename = `${baselineDirectory}/${name}`
    const record = parseBaseline((await read('target', filename))!, filename)
    stored.set(record.path, record)
  }
  const metadataPath = path.resolve(plan.assetDir, '../package.json')
  const metadata = JSON.parse((await read('config', metadataPath))!.toString()) as { name: string, version: string }
  if (metadata.name !== templatePackage || typeof metadata.version !== 'string' || !metadata.version) {
    throw new Error('Invalid template package identity.')
  }

  async function conflict(filename: string, upstream: Buffer | null, reason: string, detail: string) {
    const file = await put(filename, upstream, reason, detail)
    file.status = 'conflict'
    file.afterHash = file.beforeHash
    file.content = null
    file.automatic = false
    return file
  }

  async function asset(filename: string, assetPath: string, source: Buffer, upstream: Buffer, semantic: boolean) {
    seen.add(filename)
    if (!isRootAsset(filename)) {
      return { content: upstream }
    }
    const before = await read('target', filename)
    const previous = stored.get(filename)
    if (await read('target', presetBaselinePath(filename)) !== null) {
      await conflict(filename, upstream, 'preset-owned-asset', 'This asset belongs to an organization preset; upgrade it with repo presets plan and apply.')
      return null
    }
    const record: RootAssetBaseline = {
      schemaVersion: 1,
      path: filename,
      source: { package: templatePackage, version: metadata.version, assetPath, hash: hash(source) },
      upstream: { hash: hash(upstream), content: upstream.toString('base64') },
    }
    if (previous && before === null) {
      await put(filename, null, 'user-deletion-preserved', 'The tracked root asset was removed locally; restore it manually before upgrading.', { skip: true })
      return null
    }
    proposed.set(filename, record)
    if (semantic || before === null || options.overwrite || (filename === '.github/workflows/release.yml' && options.overwriteRelease)) {
      return { content: upstream }
    }
    if (options.noOverwrite || options.skipOverwrite) {
      return { content: upstream }
    }
    if (!previous) {
      if (before.equals(upstream)) {
        return { content: upstream }
      }
      const file = await conflict(filename, upstream, 'baseline-missing', 'No historical upstream baseline exists. Review the diff and use --overwrite to explicitly adopt the current template.')
      file.merge = { baseHash: null, localHash: hash(before), upstreamHash: hash(upstream), conflicts: [] }
      return null
    }
    const merged = mergeRootAsset(Buffer.from(previous.upstream.content, 'base64'), before, upstream)
    if (merged.content === null) {
      const file = await conflict(filename, upstream, merged.reason, 'Local and upstream changes could not be merged safely. Review the base/local/upstream regions in JSON; the file and baseline remain unchanged.')
      file.merge = merged.details
      return null
    }
    return { content: merged.content, reason: merged.reason, merge: merged.details }
  }

  async function removals() {
    for (const [filename, record] of stored) {
      if (seen.has(filename) || !plan.targets.some(target => filename === target || filename.startsWith(`${target}/`))) {
        continue
      }
      if (await read('target', presetBaselinePath(filename)) !== null) {
        await conflict(filename, null, 'preset-owned-asset', 'This asset also has organization preset ownership; reconcile the provider records before removal.')
        continue
      }
      if (await read('asset', record.source.assetPath) !== null) {
        continue
      }
      const before = await read('target', filename)
      if (before === null || hash(before) === record.upstream.hash) {
        await put(filename, null, 'upstream-asset-removed', 'The upstream asset was removed and has no local modifications.')
        proposed.set(filename, null)
      }
      else {
        await conflict(filename, null, 'upstream-removal-conflict', 'Upstream removed this asset, but it contains local modifications. Both the file and baseline are retained.')
      }
    }
  }

  async function finalize() {
    for (const [filename, record] of proposed) {
      const file = plan.files.find(item => item.path === filename)
      if (!file || ['skip', 'conflict'].includes(file.status)) {
        continue
      }
      // A later semantic migration may remove an asset planned earlier.
      const next = file.afterHash === null ? null : record
      const destination = baselinePath(filename)
      const before = await read('target', destination)
      const after = next === null ? null : encodeBaseline(next)
      const beforeHash = before === null ? null : hash(before)
      const afterHash = after === null ? null : hash(after)
      if (beforeHash !== afterHash) {
        file.baseline = { path: destination, beforeHash, afterHash, content: after?.toString('base64') ?? null }
      }
      if (file.status === 'identical' && file.baseline) {
        file.automatic = true
      }
    }
  }

  function annotate(file: UpgradeFilePlan, result: NonNullable<Awaited<ReturnType<typeof asset>>>) {
    if ('merge' in result && result.merge) {
      file.merge = result.merge
      if (file.status !== 'skip') {
        file.automatic = true
      }
    }
  }
  return { asset, removals, finalize, annotate }
}
