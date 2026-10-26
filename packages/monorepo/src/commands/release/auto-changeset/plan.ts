import type { AutoChangesetOptions, AutoChangesetReport, AutoChangesetRevision } from './types'
import { createGitHub } from './github/client'
import { assertRevision, readRevision } from './github/revision'
import { readBlob, readFiles, readTree } from './github/tree'
import { manualIntents } from './manual'
import { isManagedContent, managedPath, renderChangeset } from './ownership'
import { readPolicy } from './policy'
import { labelLevel, selectLevel, selectPackages } from './selection'
import { discoverPackages } from './workspace'

export async function planAutoChangeset(options: AutoChangesetOptions, expected?: AutoChangesetRevision) {
  const client = createGitHub(options)
  const initial = await readRevision(client, options)
  const { policy, policyDigest } = await readPolicy(client, initial, options)
  const revision: AutoChangesetRevision = { ...initial, policyDigest }
  if (expected) {
    assertRevision(revision, expected)
  }
  const report: AutoChangesetReport = { schemaVersion: 1, revision, status: 'unchanged', packages: [], diagnostics: [] }
  if (revision.headRepository !== revision.repository || revision.headRepositoryId !== revision.repositoryId) {
    report.status = 'fork'
    report.diagnostics.push('Fork pull requests are read-only and never receive generated commits.')
    return { report, client }
  }
  if (revision.state !== 'open' || revision.draft) {
    report.status = 'inactive'
    return { report, client }
  }
  const level = labelLevel(policy, revision)
  const [files, headTree, baseTree] = await Promise.all([
    readFiles(client, revision),
    readTree(client, revision.headSha),
    readTree(client, revision.baseSha),
  ])
  const [head, base] = await Promise.all([discoverPackages(client, headTree), discoverPackages(client, baseTree)])
  const filename = managedPath(revision.pullRequest)
  const existingEntry = headTree.entries.get(filename)
  const existing = existingEntry ? await readBlob(client, existingEntry) : undefined
  const manual = await manualIntents(client, files, headTree, [...head, ...base], filename)
  if (existing !== undefined && !isManagedContent(existing, revision)) {
    report.status = 'protected'
    report.diagnostics.push(`${filename} is unowned or has human edits; it will not be overwritten or deleted.`)
  }
  else {
    if (manual.length || level === 'none') {
      report.status = manual.length ? 'manual' : 'no-release'
      report.diagnostics.push(...manual.map(file => `Handwritten intent takes priority: ${file}.`))
    }
    else {
      report.packages = selectPackages(files, head, base, policy, selectLevel(policy, revision))
    }
    if (report.packages.length) {
      const content = renderChangeset(report.packages, policy, revision)
      if (existing !== content) {
        report.status = 'planned'
        report.change = { path: filename, action: 'upsert', content }
      }
    }
    else if (existing !== undefined) {
      report.change = { path: filename, action: 'delete' }
      if (report.status === 'unchanged') {
        report.status = 'planned'
      }
    }
  }
  // Detect pagination races and edits to the policy/title/labels as well as new commits.
  const latest = await readRevision(client, options)
  const latestPolicy = await readPolicy(client, latest, options)
  assertRevision({ ...latest, policyDigest: latestPolicy.policyDigest }, revision)
  return { report, client, headTree }
}

/** Build a deterministic proposal from immutable metadata without executing candidate code. */
export async function createAutoChangesetPlan(options: AutoChangesetOptions): Promise<AutoChangesetReport> {
  return (await planAutoChangeset(options)).report
}
