import type { DocsDeploymentResult, DocsDeploymentState, DocsOptions, DocsProviderReceipt } from './types'
import { randomUUID } from 'node:crypto'
import path from 'pathe'
import { DocsDiagnosticError } from './diagnostics'
import { docsEnvironment, docsInstallEnvironment, runDocsProcess } from './execute'
import { git, withSource } from './git'
import { applyDocsPatches } from './patches'
import { prepareDocsPlan } from './plan'
import { prepareDocsProvider, reconcileDocsProvider } from './providers'
import { verifyDocsReadiness } from './readiness'
import { createDocsReport } from './report'
import { assertProviderReceipt, readDocsState, writeDocsState } from './state'

/** Build, deploy and optionally verify an independently recoverable documentation snapshot. */
export async function deployDocs(options: DocsOptions): Promise<DocsDeploymentResult> {
  const report = createDocsReport(options)
  let cleanup: (() => Promise<void>) | undefined
  let resumablePhase: 'deploying' | 'verifying' | undefined
  let receipt: DocsProviderReceipt | undefined
  try {
    const prepared = await report.run('plan', async () => {
      const prepared = await prepareDocsPlan(options)
      report.setIdentity(prepared.plan)
      if (!prepared.plan.eligible) {
        throw new DocsDiagnosticError('plan-blocked')
      }
      return prepared
    })
    const { plan, previous, context, snapshot } = prepared
    if (plan.skipped) {
      return { plan, status: 'skipped', report: await report.finish('skipped') }
    }
    const target = context.site[options.channel]
    const pending = previous.state.pending
    const sameDeployment = pending?.deploymentId === plan.deploymentId
    const resumeVerification = sameDeployment && pending?.phase === 'verifying'
    const resumeProvider = sameDeployment && pending?.phase === 'deploying'
    const runId = context.env['GITHUB_RUN_ID'] ?? randomUUID()
    let state: DocsDeploymentState = {
      ...previous.state,
      pending: {
        deploymentId: plan.deploymentId,
        runId,
        phase: resumeVerification ? 'verifying' : resumeProvider ? 'deploying' : 'building',
        ...(resumeVerification ? { receipt: pending.receipt! } : {}),
        ...(snapshot ? { snapshot } : {}),
      },
    }
    let revision: string | undefined
    const claim = async () => {
      const serialized = context.env['GITHUB_ACTIONS'] === 'true' && Boolean(context.env['GITHUB_RUN_ID'])
        && context.env['REPO_DOCS_CONCURRENCY_GROUP'] === `docs-${options.site}-${options.channel}`
      if (options.channel === 'stable' && !serialized) {
        throw new DocsDiagnosticError('workflow-required')
      }
      if (pending && (!serialized || (options.channel === 'stable' && pending.phase !== 'building' && !sameDeployment))) {
        throw new DocsDiagnosticError('deployment-unresolved')
      }
      if (resumeVerification && !target.readiness) {
        throw new DocsDiagnosticError('readiness-policy-missing')
      }
      revision = await writeDocsState(context, state, previous.revision)
      resumablePhase = resumeVerification ? 'verifying' : resumeProvider ? 'deploying' : undefined
      cleanup = async () => {
        if (!resumablePhase) {
          const { pending: _pending, ...idle } = state
          await writeDocsState(context, idle, revision)
        }
      }
    }
    const assertClaim = async () => {
      const latest = await readDocsState(context, options.site, options.channel)
      if (latest.revision !== revision || latest.state.pending?.deploymentId !== plan.deploymentId || latest.state.pending.runId !== runId) {
        throw new DocsDiagnosticError('claim-changed')
      }
      if (options.channel === 'preview' && await context.github.readBranchHead('main') !== plan.sourceSha) {
        throw new DocsDiagnosticError('main-advanced')
      }
    }
    const verifyAndComplete = async (result: DocsProviderReceipt): Promise<DocsDeploymentResult> => {
      if (target.readiness) {
        await report.run('readiness', () => verifyDocsReadiness(target, plan, options.fetch))
      }
      else {
        report.skip('readiness', 'not-required')
      }
      await report.run('finalize', async () => {
        await assertClaim()
        if (target.readiness) {
          await reconcileDocsProvider(options, context.site, plan, context.env, result)
          // Reconciliation is asynchronous; a competing claim or new main must still win.
          await assertClaim()
        }
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
        await writeDocsState(context, complete, revision)
        cleanup = undefined
        resumablePhase = undefined
      })
      return { plan, status: 'deployed', ...result, report: await report.finish('deployed', undefined, result.versionId) }
    }
    if (resumeVerification) {
      await report.run('preflight', claim)
      receipt = pending.receipt!
      report.skip('install', 'resumed-verification')
      report.skip('build', 'resumed-verification')
      await report.run('provider', () => reconcileDocsProvider(options, context.site, plan, context.env, receipt!), { operation: 'reconcile' })
      return await verifyAndComplete(receipt)
    }
    const deployed = await withSource(options.cwd, plan.sourceSha, async (source) => {
      const resultFile = path.join(path.dirname(source), 'deployment-result.json')
      const env = docsEnvironment(context, plan, resultFile)
      const operation: { operation: 'upload' | 'reconcile' } = { operation: 'upload' }
      const prepareProvider = await report.run('preflight', async () => {
        await claim()
        applyDocsPatches(options.cwd, source, plan.sourceSha, plan.commits, context.site)
        if (git(source, ['write-tree']) !== plan.treeSha) {
          throw new DocsDiagnosticError('source-tree-changed')
        }
        return prepareDocsProvider(options, source, context.site, plan, env, resultFile, operation)
      })
      await report.run('install', () => runDocsProcess(options, source, ['install', '--frozen-lockfile'], docsInstallEnvironment(context.env)))
      await report.run('build', () => runDocsProcess(options, source, ['run', context.site.buildScript], env))
      receipt = await report.run('provider', async () => {
        await assertClaim()
        const deploy = await prepareProvider()
        state = { ...state, pending: { ...state.pending!, phase: 'deploying' } }
        revision = await writeDocsState(context, state, revision)
        resumablePhase = 'deploying'
        const result = await deploy()
        receipt = result
        if (target.readiness) {
          assertProviderReceipt(result)
          state = { ...state, pending: { ...state.pending!, phase: 'verifying', receipt: result } }
          revision = await writeDocsState(context, state, revision)
          resumablePhase = 'verifying'
        }
        return result
      }, operation)
      return receipt
    })
    return await verifyAndComplete(deployed)
  }
  catch (error) {
    // Cleanup is CAS-protected; a competing claim or cleanup failure cannot mask the first failure.
    try {
      await cleanup?.()
    }
    catch {}
    throw await report.fail(error, resumablePhase, receipt?.versionId)
  }
}
