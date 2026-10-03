import type { FileTransactionChange } from '../../core/file-transaction'
import type { PublicApiOptions, PublicApiReport, PublicApiUpdatePlan, PublicApiUpdateResult } from './types'
import { Buffer } from 'node:buffer'
import { readFile } from 'node:fs/promises'
import { isDeepStrictEqual } from 'node:util'
import { writeFileTransaction } from '../../core/file-transaction'
import { withOperationLock } from '../../core/operation-lock'
import { hash } from '../deps/files'
import { checkPublicApi } from './index'
import { apiReportSettings } from './settings'

export async function planPublicApiUpdate(cwd: string, options: PublicApiOptions = {}): Promise<PublicApiUpdatePlan> {
  return { schemaVersion: 1, kind: 'public-api-update', report: await checkPublicApi(cwd, options) }
}

/** Only baseline state may move from reviewed before to reviewed after on a repeated apply. */
function comparable(report: PublicApiReport) {
  return { ...report, status: undefined, entries: report.entries.map(entry => ({ ...entry, status: undefined, before: undefined, beforeHash: undefined, diff: undefined })) }
}

export async function applyPublicApiUpdate(cwd: string, plan: PublicApiUpdatePlan, options: Pick<PublicApiOptions, 'signal' | 'timeoutMs'> = {}): Promise<PublicApiUpdateResult> {
  if (!plan || plan.schemaVersion !== 1 || plan.kind !== 'public-api-update' || !plan.report || plan.report.kind !== 'public-api-report'
    || !Array.isArray(plan.report.entries) || !Array.isArray(plan.report.selection) || ['failed', 'skipped'].includes(plan.report.status)) {
    throw new Error('A successful reviewed public API update plan is required.')
  }
  const settings = await apiReportSettings(cwd, { ...options, packages: plan.report.selection })
  if (settings.root !== plan.report.workspaceDir) {
    throw new Error('API report plan belongs to another workspace.')
  }
  return withOperationLock(settings.root, 'api-reports', async () => {
    const current = await checkPublicApi(settings.root, { ...options, packages: plan.report.selection })
    if (current.status === 'failed' || !isDeepStrictEqual(comparable(plan.report), comparable(current))) {
      throw new Error('API report inputs, configuration, tool or signatures changed; generate and review a new plan.')
    }
    const files: FileTransactionChange[] = []
    let applied = 0
    for (const [index, entry] of current.entries.entries()) {
      const reviewed = plan.report.entries[index]!
      if (reviewed.beforeHash !== entry.beforeHash) {
        if (reviewed.afterHash !== entry.beforeHash || entry.status !== 'unchanged') {
          throw new Error(`API baseline changed after preview: ${entry.baseline}`)
        }
        applied++
      }
      else if (entry.status !== 'unchanged') {
        files.push({
          path: entry.baseline,
          beforeHash: entry.beforeHash,
          afterHash: entry.afterHash,
          content: Buffer.from(entry.after!).toString('base64'),
        })
      }
    }
    if (applied && files.length) {
      throw new Error('API baseline plan is partially applied; recover retained backups or review a fresh plan.')
    }
    options.signal?.throwIfAborted()
    const verify = async () => {
      for (const entry of current.entries) {
        for (const input of entry.inputs) {
          if (hash(await readFile(input.path, 'utf8')) !== input.hash) {
            throw new Error(`API compiler input changed during update: ${input.path}`)
          }
        }
      }
    }
    await verify()
    if (files.length) {
      await writeFileTransaction(settings.root, files, { verify })
    }
    return { status: files.length ? 'applied' : 'unchanged', changed: files.map(file => file.path) }
  })
}
