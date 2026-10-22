import type { DocsContext } from './config'
import type { DocsDeploymentPlan, DocsOptions, StableDocsSnapshot } from './types'
import { docsIdentity, resolveDocsSite } from './config'
import { readDocsState } from './state'

export async function prepareDocsContext(options: DocsOptions) {
  const identity = docsIdentity(options)
  const previous = await readDocsState(identity, options.site, options.channel)
  const pending = previous.state.pending
  const snapshot = options.channel === 'stable' ? pending?.snapshot : undefined
  const releaseId = options.channel === 'stable'
    ? options.release ?? previous.state.current?.releaseId ?? snapshot?.releaseId
    : undefined
  const requestedCommits = [...new Set(options.commits ?? [])]
  const sameRequest = snapshot?.releaseId === releaseId
    && JSON.stringify(snapshot?.requestedCommits) === JSON.stringify(requestedCommits)
  const recovery = sameRequest ? snapshot : undefined
  if (options.channel === 'stable' && pending?.phase === 'deploying' && !recovery) {
    throw new Error(`Documentation deployment ${pending.deploymentId} has an unfinished deploying operation; rerun that deployment in the managed workflow before advancing`)
  }
  // Resolve live configuration only after checking for an immutable recovery snapshot.
  const context: DocsContext = { ...identity, site: recovery?.config ?? await resolveDocsSite(options) }
  return { context, previous, releaseId, requestedCommits, recovery }
}

export function assertRecoveredPlan(plan: DocsDeploymentPlan, snapshot: StableDocsSnapshot, deploymentId: string) {
  if (plan.sourceSha !== snapshot.sourceSha || plan.releaseId !== snapshot.releaseId
    || plan.treeSha !== snapshot.treeSha || plan.deploymentId !== deploymentId
    || JSON.stringify(plan.commits) !== JSON.stringify(snapshot.commits)) {
    throw new Error('Frozen stable documentation snapshot no longer matches the verified deployment')
  }
}
