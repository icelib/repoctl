import type { Buffer } from 'node:buffer'
import type { UpgradeFilePlan, UpgradeInput, UpgradeOptions, UpgradePlan } from '../../../types/upgrade'
import process from 'node:process'
import path from 'pathe'
import { assetsDir } from '../../../constants'
import { getRepoctlConfigCandidates, loadMonorepoConfigDetails } from '../../../core/config'
import { getAssetTargets } from '../targets'
import { fileDiff } from './diff'
import { canonicalDirectory, hash, readOptional, relativeFile } from './files'

export async function createContext(opts: UpgradeOptions) {
  const cwd = await canonicalDirectory(path.resolve(opts.cwd ?? process.cwd()))
  const loaded = await loadMonorepoConfigDetails(cwd, { refresh: true })
  const config = loaded.config.commands?.upgrade ?? {}
  const options = { ...config, ...opts, cwd }
  const rootDir = await canonicalDirectory(path.resolve(cwd, options.outDir ?? ''))
  const base = getAssetTargets(options.core ?? false)
  const configured = config.targets?.length ? (config.mergeTargets === false ? config.targets : [...base, ...config.targets]) : base
  const targets = [...new Set(opts.targets ?? configured)].map(relativeFile).sort()
  const plan: UpgradePlan = { schemaVersion: 1, cwd, rootDir, assetDir: path.resolve(await canonicalDirectory(assetsDir)), status: 'ready', targets, discovery: null, inputs: [], files: [], blockers: [] }
  const buffers = new Map<string, Buffer | null>()
  async function read(area: UpgradeInput['area'], filename: string) {
    const key = `${area}:${filename}`
    if (buffers.has(key)) {
      return buffers.get(key)!
    }
    const root = area === 'target' ? plan.rootDir : area === 'asset' ? plan.assetDir : path.dirname(filename)
    const content = await readOptional(root, area === 'config' ? path.basename(filename) : filename)
    buffers.set(key, content)
    plan.inputs.push({ area, path: filename, hash: content === null ? null : hash(content) })
    return content
  }
  for (const candidate of new Set([...getRepoctlConfigCandidates(cwd), ...loaded.files])) {
    await read('config', candidate)
  }
  function conflict(filename: string, error: unknown) {
    const detail = error instanceof Error ? error.message : String(error)
    plan.files.push({ path: filename, status: 'conflict', reason: 'unsafe-or-invalid-file', detail, beforeHash: null, afterHash: null, content: null, binary: false, diff: null, group: null, automatic: false })
    plan.blockers.push({ id: 'unsafe-or-invalid-file', path: filename, detail })
  }
  async function put(filename: string, after: Buffer | null, reason: string, detail: string, flags: { skip?: boolean, force?: boolean, group?: string } = {}) {
    const before = await read('target', filename)
    const beforeHash = before === null ? null : hash(before)
    const afterHash = after === null ? null : hash(after)
    const protectedFile = before !== null && !flags.force && (options.noOverwrite || options.skipOverwrite)
    const status = flags.skip || protectedFile ? 'skip' : beforeHash === afterHash ? 'identical' : after === null ? 'delete' : before === null ? 'add' : 'modify'
    const unchanged = ['skip', 'identical'].includes(status)
    const file: UpgradeFilePlan = { path: filename, status, reason: protectedFile ? 'overwrite-disabled' : reason, detail: protectedFile ? 'Existing files are protected by no-overwrite/skip-overwrite.' : detail, beforeHash, afterHash: unchanged ? beforeHash : afterHash, content: unchanged || after === null ? null : after.toString('base64'), ...fileDiff(filename, before, unchanged ? before : after), group: flags.group ?? null, automatic: before === null || Boolean(flags.force || options.yes || options.overwrite) }
    const index = plan.files.findIndex(item => item.path === filename)
    if (index >= 0) {
      plan.files[index] = file
    }
    else {
      plan.files.push(file)
    }
    return file
  }
  return { plan, options, config, read, put, conflict }
}

export type UpgradeContext = Awaited<ReturnType<typeof createContext>>
