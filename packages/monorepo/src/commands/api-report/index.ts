import type { PublicApiEntryReport, PublicApiOptions, PublicApiReport } from './types'
import { Buffer } from 'node:buffer'
import { hash } from '../deps/files'
import { fileDiff } from '../upgrade/plan/diff'
import { publicApiIntents } from './intents'
import { entryPaths, reportPath } from './paths'
import { apiReportSettings } from './settings'
import { extractPublicApi, resolveApiExtractor } from './tool'

export { formatPublicApiReport } from './report'
export type * from './types'
export { applyPublicApiUpdate, planPublicApiUpdate } from './update'

export async function checkPublicApi(cwd: string, options: PublicApiOptions = {}): Promise<PublicApiReport> {
  options.signal?.throwIfAborted()
  const settings = await apiReportSettings(cwd, options)
  const report: PublicApiReport = {
    schemaVersion: 1,
    kind: 'public-api-report',
    workspaceDir: settings.root,
    configurationHash: settings.configurationHash,
    selection: settings.selection,
    tool: null,
    status: 'skipped',
    entries: [],
    skipped: settings.skipped,
    diagnostics: [],
    review: 'Review public signatures and linked change intents. API reports do not infer a complete SemVer decision; runtime behavior and compatibility require human review.',
  }
  if (!settings.entries.length) {
    return report
  }
  const baselines = settings.entries.flatMap(({ config }) => Object.values(config.entries).map(entry => reportPath(entry.baseline)))
  if (new Set(baselines.map(value => value.toLowerCase())).size !== baselines.length) {
    throw new Error('API report entries must have distinct baseline paths, including case-insensitive filesystems.')
  }
  let tool
  try {
    tool = await resolveApiExtractor(settings.root)
    report.tool = { version: tool.version, moduleHash: tool.moduleHash }
  }
  catch (error) {
    report.status = 'failed'
    report.diagnostics.push({ code: 'api-tool-unavailable', severity: 'error', message: (error as Error).message })
    return report
  }
  let intents: (workspace: string, name: string | null) => string[] = () => []
  try {
    intents = await publicApiIntents(settings.root)
  }
  catch {
    report.diagnostics.push({ code: 'api-intents-unavailable', severity: 'warning', message: 'Change intent evidence could not be read; inspect .changeset and its ledger before choosing a release bump.' })
  }
  for (const { node, config } of settings.entries) {
    for (const [subpath, definition] of Object.entries(config.entries).sort(([a], [b]) => a.localeCompare(b))) {
      options.signal?.throwIfAborted()
      const entry: PublicApiEntryReport = {
        workspace: node.id,
        packageName: node.name ?? null,
        subpath,
        entryPoint: definition.entryPoint,
        baseline: definition.baseline,
        status: 'failed',
        before: null,
        after: null,
        inputHash: null,
        inputs: [],
        beforeHash: null,
        afterHash: null,
        diff: null,
        diagnostics: [],
        changeIntents: intents(node.id, node.name ?? null),
      }
      report.entries.push(entry)
      try {
        const files = await entryPaths(settings.root, node.id, subpath, definition, config.tsconfig)
        entry.entryPoint = files.entryRelative
        entry.before = files.before
        entry.beforeHash = files.before === null ? null : hash(files.before)
        const extracted = await extractPublicApi(settings.root, tool.module, files.packageJson, files.entryPoint, files.tsconfig, { ...options, timeoutMs: settings.timeoutMs })
        entry.diagnostics = extracted.diagnostics
        entry.inputHash = extracted.inputHash
        entry.inputs = extracted.inputs
        if (extracted.succeeded && extracted.report !== null) {
          entry.after = extracted.report
          entry.afterHash = hash(extracted.report)
          entry.status = files.before === null ? 'new' : files.before.replaceAll('\r\n', '\n') === extracted.report ? 'unchanged' : 'changed'
          entry.diff = entry.status === 'unchanged' ? '' : fileDiff(files.baseline, files.before === null ? null : Buffer.from(files.before), Buffer.from(extracted.report)).diff
        }
      }
      catch (error) {
        options.signal?.throwIfAborted()
        entry.diagnostics.push({ code: 'api-analysis-failed', severity: 'error', message: (error as Error).message })
      }
    }
  }
  report.status = report.entries.some(entry => entry.status === 'failed') ? 'failed' : report.entries.some(entry => entry.status !== 'unchanged') ? 'changes' : 'unchanged'
  return report
}
