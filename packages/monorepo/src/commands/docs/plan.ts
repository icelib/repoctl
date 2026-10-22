import type { DocsDeploymentPlan, DocsOptions, StableDocsSnapshot } from './types'
import { createHash } from 'node:crypto'
import { readReleaseCompletion } from '../release/completion'
import { checkReleaseCoverage, coveredPackages } from './coverage'
import { assertMainSource, git, isAncestor, withSource } from './git'
import { applyDocsPatches } from './patches'
import { assertRecoveredPlan, prepareDocsContext } from './recovery'

export async function prepareDocsPlan(options: DocsOptions) {
  if (options.channel === 'preview' && (options.release || options.commits?.length)) {
    throw new Error('Preview only accepts a source SHA, not stable release records or corrections')
  }
  if (options.channel === 'stable' && options.sourceSha) {
    throw new Error('Stable documentation requires a completed release record, never an arbitrary source SHA')
  }
  const { context, previous, releaseId, requestedCommits, recovery } = await prepareDocsContext(options)
  const current = previous.state.current
  const blockers: string[] = []
  const record = releaseId ? await readReleaseCompletion(context.github, releaseId) : undefined
  if (options.channel === 'stable' && !record) {
    throw new Error('No stable documentation baseline exists; wait for a complete stable release and provide its record ID')
  }
  if (record && (record.repository !== context.repository || record.branch !== 'main' || record.distTag !== 'latest')) {
    throw new Error('Stable documentation requires this repository’s main/latest release completion')
  }
  const sourceSha = record?.sourceSha ?? options.sourceSha
  if (!sourceSha) {
    throw new Error('Preview requires an explicit source SHA')
  }
  assertMainSource(options.cwd, sourceSha)
  if (options.channel === 'preview' && git(options.cwd, ['rev-parse', 'refs/remotes/origin/main']) !== sourceSha) {
    blockers.push('Preview source is no longer the latest fetched origin/main')
  }
  return withSource(options.cwd, sourceSha, async (source) => {
    const names = record ? (await coveredPackages(source, context.site)).map(pkg => pkg.manifest.name!) : []
    const unrelated = Boolean(record && !record.releasedPackages.some(name => names.includes(name)))
    if (unrelated && requestedCommits.length) {
      blockers.push('Unrelated release cannot supply a documentation correction baseline; omit --release to use the current stable baseline, or select a release that publishes a covered package')
    }
    if (!unrelated && current && !isAncestor(options.cwd, current.sourceSha, sourceSha)) {
      blockers.push('A newer documentation source is already deployed; an older run cannot replace it')
    }
    const coverage = record && !unrelated ? await checkReleaseCoverage(source, record, context.site) : undefined
    blockers.push(...(coverage?.blockers ?? []))
    let commits: string[] = []
    try {
      if (!unrelated) {
        commits = applyDocsPatches(options.cwd, source, sourceSha, [...(current?.commits ?? []), ...requestedCommits], context.site)
      }
    }
    catch (error) {
      blockers.push(error instanceof Error ? error.message : String(error))
    }
    const treeSha = git(source, ['write-tree'])
    const identity = { repository: context.repository, site: options.site, channel: options.channel, sourceSha, releaseId, commits, treeSha, config: context.site }
    const deploymentId = createHash('sha256').update(JSON.stringify(identity)).digest('hex')
    const plan: DocsDeploymentPlan = {
      schemaVersion: 1,
      repository: context.repository,
      site: options.site,
      channel: options.channel,
      sourceSha,
      ...(releaseId ? { releaseId } : {}),
      packages: record?.packages.filter(pkg => names.includes(pkg.name)) ?? [],
      commits,
      treeSha,
      deploymentId,
      ...(previous.revision ? { baseRevision: previous.revision } : {}),
      eligible: blockers.length === 0,
      skipped: unrelated ? requestedCommits.length === 0 : current?.deploymentId === deploymentId,
      blockers,
    }
    if (recovery) {
      assertRecoveredPlan(plan, recovery, previous.state.pending!.deploymentId)
    }
    const snapshot: StableDocsSnapshot | undefined = releaseId
      ? { releaseId, requestedCommits, sourceSha, commits, treeSha, config: context.site }
      : undefined
    return { plan, previous, context, snapshot }
  })
}

/** Inspect a frozen checkout without installing, building, deploying, or writing remote state. */
export async function planDocsDeployment(options: DocsOptions): Promise<DocsDeploymentPlan> {
  return (await prepareDocsPlan(options)).plan
}
