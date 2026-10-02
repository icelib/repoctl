import type { TemplateInstance } from '@icebreakers/monorepo-templates'
import type { TemplateUpgradePlan } from '../types'
import type { UpgradeOperation } from './state'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'
import { safeInstancePath } from '@icebreakers/monorepo-templates'
import path from 'pathe'
import { sameEntry } from '../changes'
import { upgradeDigest } from '../digest'
import { desiredUpgradeState, readUpgradeFileState, validateUpgradeFileState } from './state'

export interface TemplateUpgradeJournal {
  schemaVersion: 1
  kind: 'template-instance-upgrade'
  token: string
  instanceId: string
  target: string
  before: TemplateInstance
  after: TemplateInstance
  operations: UpgradeOperation[]
  digest: string
}

export function templateUpgradeJournalPath(instanceId: string) {
  if (!/^[a-f0-9]{24}$/u.test(instanceId)) {
    throw new Error('Invalid template instance recovery identity.')
  }
  return `.repoctl/template-upgrades/${instanceId}.json`
}

export async function loadTemplateUpgradeJournal(cwd: string, instanceId: string): Promise<TemplateUpgradeJournal | undefined> {
  const filename = await safeInstancePath(cwd, templateUpgradeJournalPath(instanceId))
  let content: string
  try {
    content = await fs.readFile(filename, 'utf8')
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return undefined
    }
    throw error
  }
  const journal = JSON.parse(content) as TemplateUpgradeJournal
  const { digest, ...body } = journal
  if (journal.schemaVersion !== 1 || journal.kind !== 'template-instance-upgrade' || journal.instanceId !== instanceId
    || !/^[a-f0-9-]{36}$/u.test(journal.token) || journal.before?.id !== instanceId || journal.after?.id !== instanceId
    || journal.before.target !== journal.target || journal.after.target !== journal.target
    || !Array.isArray(journal.operations) || upgradeDigest(body) !== digest) {
    throw new Error(`Invalid template upgrade recovery record: ${filename}`)
  }
  const root = await safeInstancePath(cwd, journal.target)
  const seen = new Set<string>()
  for (const operation of journal.operations) {
    if (!operation || typeof operation.path !== 'string' || seen.has(operation.path)) {
      throw new Error('Invalid template upgrade recovery paths.')
    }
    await safeInstancePath(root, operation.path)
    seen.add(operation.path)
    validateUpgradeFileState(operation.before)
    validateUpgradeFileState(operation.after)
    if (!operation.before && !operation.after) {
      throw new Error('Invalid empty template upgrade recovery operation.')
    }
  }
  return journal
}

export async function createTemplateUpgradeJournal(plan: TemplateUpgradePlan, before: TemplateInstance) {
  const root = await safeInstancePath(plan.options.cwd, plan.target)
  const operations: UpgradeOperation[] = []
  for (const change of plan.changes.filter(item => ['add', 'modify', 'delete'].includes(item.status))) {
    const state = await readUpgradeFileState(root, change.path)
    if (!sameEntry(state?.entry ?? null, change.before)) {
      throw new Error(`Template instance changed before its recovery record was created: ${change.path}`)
    }
    const after = desiredUpgradeState(change.after, state)
    validateUpgradeFileState(after)
    operations.push({ path: change.path, before: state, after })
  }
  const body = { schemaVersion: 1 as const, kind: 'template-instance-upgrade' as const, token: randomUUID(), instanceId: before.id, target: before.target, before, after: plan.nextInstance, operations }
  const journal: TemplateUpgradeJournal = { ...body, digest: upgradeDigest(body) }
  const filename = await safeInstancePath(plan.options.cwd, templateUpgradeJournalPath(before.id))
  await fs.mkdir(path.dirname(filename), { recursive: true })
  const temporary = `${filename}.${journal.token}.tmp`
  let owned = false
  try {
    const handle = await fs.open(temporary, 'wx', 0o600)
    owned = true
    try {
      await handle.writeFile(`${JSON.stringify(journal)}\n`)
      await handle.sync()
    }
    finally {
      await handle.close()
    }
    await fs.link(temporary, filename)
  }
  finally {
    if (owned) {
      await fs.rm(temporary, { force: true })
    }
  }
  return journal
}

export async function removeTemplateUpgradeJournal(cwd: string, journal: TemplateUpgradeJournal) {
  const current = await loadTemplateUpgradeJournal(cwd, journal.instanceId)
  if (!current) {
    return
  }
  if (current.token !== journal.token || current.digest !== journal.digest) {
    throw new Error('The template recovery record was replaced; preserve it for its owning operation.')
  }
  await fs.unlink(await safeInstancePath(cwd, templateUpgradeJournalPath(journal.instanceId)))
}
