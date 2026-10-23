import type { DocsDeploymentResult, DocsDeploymentState, DocsOptions } from './types'
import { randomUUID } from 'node:crypto'
import path from 'pathe'
import { docsEnvironment, runDocsProcess } from './execute'
import { git, withSource } from './git'
import { applyDocsPatches } from './patches'
import { prepareDocsPlan } from './plan'
import { prepareDocsProvider } from './providers'
import { readDocsState } from './state'

/** Build and deploy an independently retryable, immutable documentation snapshot. */
export async function deployDocs(options: DocsOptions): Promise<DocsDeploymentResult> {
  const { plan, previous, context, snapshot } = await prepareDocsPlan(options)
  if (!plan.eligible) {
    throw new Error(`Documentation deployment blocked:\n${plan.blockers.join('\n')}`)
  }
  if (plan.skipped) {
    return { plan, status: 'skipped' }
  }
  const serialized = context.env['GITHUB_ACTIONS'] === 'true' && Boolean(context.env['GITHUB_RUN_ID'])
    && context.env['REPO_DOCS_CONCURRENCY_GROUP'] === `docs-${options.site}-${options.channel}`
  if (options.channel === 'stable' && !serialized) {
    throw new Error('Stable documentation must run in the managed workflow with its per-site concurrency group; use repo docs plan locally')
  }
  const runId = context.env['GITHUB_RUN_ID'] ?? randomUUID()
  const pending = previous.state.pending
  const resumeProvider = pending?.phase === 'deploying' && pending.deploymentId === plan.deploymentId
  if (pending && (!serialized || (options.channel === 'stable' && pending.phase === 'deploying' && !resumeProvider))) {
    throw new Error(`Documentation deployment ${pending.deploymentId} has an unfinished ${pending.phase} operation; rerun that deployment in the managed workflow before advancing`)
  }
  let state: DocsDeploymentState = {
    ...previous.state,
    pending: { deploymentId: plan.deploymentId, runId, phase: resumeProvider ? 'deploying' : 'building', ...(snapshot ? { snapshot } : {}) },
  }
  // Claim the revision before any side effect, not after a provider has already deployed.
  let revision = await context.github.writeAutomationState(context.key, state, previous.revision)
  let providerStarted = resumeProvider
  try {
    return await withSource(options.cwd, plan.sourceSha, async (source) => {
      applyDocsPatches(options.cwd, source, plan.sourceSha, plan.commits, context.site)
      if (git(source, ['write-tree']) !== plan.treeSha) {
        throw new Error('Documentation source tree no longer matches the inspected deployment')
      }
      const resultFile = path.join(path.dirname(source), 'deployment-result.json')
      const env = docsEnvironment(context, plan, resultFile)
      const prepareProvider = await prepareDocsProvider(options, source, context.site, plan, env, resultFile)
      runDocsProcess(options, source, ['install', '--frozen-lockfile'], env)
      runDocsProcess(options, source, ['run', context.site.buildScript], env)
      const latest = await readDocsState(context, options.site, options.channel)
      if (latest.revision !== revision || latest.state.pending?.deploymentId !== plan.deploymentId || latest.state.pending.runId !== runId) {
        throw new Error('Documentation deployment claim changed during build; refusing to upload stale output')
      }
      if (options.channel === 'preview' && await context.github.readBranchHead('main') !== plan.sourceSha) {
        throw new Error('Main advanced during the preview build; refusing to deploy an outdated preview')
      }
      const deploy = await prepareProvider()
      state = { ...state, pending: { ...state.pending!, phase: 'deploying' } }
      revision = await context.github.writeAutomationState(context.key, state, revision)
      providerStarted = true
      const result = await deploy()
      const complete: DocsDeploymentState = {
        schemaVersion: 1,
        repository: context.repository,
        site: options.site,
        channel: options.channel,
        current: {
          deploymentId: plan.deploymentId,
          sourceSha: plan.sourceSha,
          ...(plan.releaseId ? { releaseId: plan.releaseId } : {}),
          commits: plan.commits,
          treeSha: plan.treeSha,
          ...result,
        },
      }
      await context.github.writeAutomationState(context.key, complete, revision)
      return { plan, status: 'deployed', ...result }
    })
  }
  catch (error) {
    // Once the provider starts, preserve the claim: a lost response may hide a successful upload.
    // A repeated, identical deployment reconciles that outcome without invoking npm publish.
    if (!providerStarted) {
      const { pending: _pending, ...idle } = state
      await context.github.writeAutomationState(context.key, idle, revision)
    }
    throw error
  }
}
