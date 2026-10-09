import type { ReleaseCiOptions, ReleaseCiStage } from '../types'
import type { StageReceipt } from './receipt'
import { randomUUID } from 'node:crypto'
import { copyFile, rm } from 'node:fs/promises'
import { performance } from 'node:perf_hooks'
import path from 'pathe'
import { logger } from '../../../core/logger'
import { createReleasePullRequest } from '../ci'
import { ReleaseCommandError } from '../errors'
import { runQualityScripts, runReleaseHooks } from '../hooks'
import { publishLifecycle } from '../lifecycle'
import { assertReleaseLineVersions, resolveReleaseBranch } from '../lines'
import { assertPlannedLine } from '../lines/preview'
import { resolveGitHub } from '../metadata'
import { assertPreviousReleaseComplete } from '../preparation/guard'
import { releasePrerelease } from '../prerelease'
import { getPublishCandidates } from '../publish'
import { reconcileRelease } from '../reconcile'
import { assertLaneAssignments, assertStableLaneAssignments, getReleaseEnv, hasPendingIntents, resolveReleaseMode } from '../shared'
import { assertStablePublish } from '../stable'
import { readReleaseTriggerContext, shouldRunRelease } from '../trigger'
import { readReceipt, reportStage, saveReceipt, stageDirectory, stageIdentity, stageOutput } from './receipt'
import { stagedSource } from './source'
import { authorizeVerification } from './verification'

const stages: ReleaseCiStage[] = ['plan', 'verify', 'prepare', 'upload', 'confirm', 'finalize']

async function plan(options: ReleaseCiOptions): Promise<StageReceipt> {
  const mode = resolveReleaseMode(options)
  const event = getReleaseEnv(options)['GITHUB_EVENT_NAME']?.trim()
  let action: StageReceipt['action'] = 'publish'
  if (mode === 'auto' && event && event !== 'workflow_dispatch' && !shouldRunRelease(await readReleaseTriggerContext(options))) {
    action = 'skip'
  }
  else if (mode === 'reconcile') {
    action = 'reconcile'
  }
  else if (options.sourceSha ?? getReleaseEnv(options)['REPO_RELEASE_RECOVERY_SOURCE_SHA']) {
    await stagedSource(options, true)
  }
  else if (mode === 'prepare') {
    action = 'prepare'
  }
  else if (mode === 'auto') {
    const rule = await resolveReleaseBranch(options)
    action = rule.kind === 'prerelease' ? 'prerelease' : await hasPendingIntents(options.cwd) ? 'prepare' : 'publish'
  }
  else if (!['publish', 'publish-unpublished'].includes(mode)) {
    throw new ReleaseCommandError(`Unknown release CI mode: ${mode}`)
  }
  if (mode === 'publish-unpublished' && !(options.sourceSha ?? getReleaseEnv(options)['REPO_RELEASE_RECOVERY_SOURCE_SHA'])) {
    const env = getReleaseEnv(options)
    const name = options.packageName ?? env['REPO_RELEASE_PACKAGE']
    const version = options.packageVersion ?? env['REPO_RELEASE_VERSION']
    if (!name || !version || !(await getPublishCandidates(options.cwd)).some(pkg => pkg.name === name && pkg.version === version)) {
      throw new ReleaseCommandError('publish-unpublished requires a matching workspace package and exact version')
    }
  }
  return { schemaVersion: 1, id: randomUUID(), identity: await stageIdentity(options), action, publish: !['skip', 'prepare'].includes(action), done: [], candidates: await getPublishCandidates(options.cwd), stages: [] }
}

async function verify(options: ReleaseCiOptions, action: StageReceipt['action']) {
  const dryRun = options.dryRun ?? getReleaseEnv(options)['REPO_RELEASE_DRY_RUN'] === 'true'
  if (action === 'reconcile' || dryRun) {
    return
  }
  if (getReleaseEnv(options)['REPO_RELEASE_SOURCE_SHA']) {
    await runQualityScripts(options)
    return
  }
  const rule = await resolveReleaseBranch(options)
  const pending = await hasPendingIntents(options.cwd)
  if (action === 'prepare' && !pending) {
    return
  }
  if (action === 'prepare' || (action === 'prerelease' && pending)) {
    if (action === 'prepare' && rule.kind === 'prerelease') {
      throw new ReleaseCommandError('Stable preparation requires a stable release branch')
    }
    if (rule.kind === 'prerelease') {
      await assertLaneAssignments(rule.lane, options)
    }
    else {
      await assertStableLaneAssignments(options)
    }
    await assertPlannedLine(rule, options)
    await assertPreviousReleaseComplete(options, rule.distTag)
    runReleaseHooks('beforeVersion', options)
  }
  else if (rule.kind === 'prerelease') {
    await assertLaneAssignments(rule.lane, options)
    assertReleaseLineVersions(rule, await getPublishCandidates(options.cwd))
  }
  else {
    await assertStablePublish(options, false)
  }
  await runQualityScripts(options)
}

export async function releaseCiStage(options: ReleaseCiOptions) {
  const stage = options.stage!
  if (!stages.includes(stage)) {
    throw new ReleaseCommandError(`Unknown release CI stage ${stage}; expected all, ${stages.join(', ')}`)
  }
  const started = performance.now()
  const receipt = stage === 'plan' ? await plan(options) : await readReceipt(options)
  if (stage !== 'plan' && !receipt.done.includes(stages[stages.indexOf(stage) - 1]!)) {
    throw new ReleaseCommandError(`Release ${stage} requires the preceding stage to complete; restart at plan if interrupted`)
  }
  if (receipt.done.includes(stage)) {
    await stageOutput(options, { run: receipt.action !== 'skip', publish: receipt.publish })
    return receipt
  }
  await saveReceipt(receipt, options)
  let effective = options
  try {
    if (receipt.action !== 'skip') {
      const source = stage === 'plan' ? undefined : await stagedSource(options, false, stage === 'verify')
      effective = source?.options ?? options
      if (!['plan', 'verify'].includes(stage) && receipt.effectiveIdentity !== await stageIdentity(effective)) {
        throw new ReleaseCommandError('Verified source/configuration changed; restart at plan and verify')
      }
      const github = resolveGitHub(effective)
      if (!github.readReleaseState || !github.writeReleaseState) {
        throw new ReleaseCommandError('Staged release requires durable GitHub checkpoint operations')
      }
      if (stage === 'verify') {
        await verify({ ...effective, github }, receipt.action)
      }
      else if (stage === 'prepare') {
        const authorized = authorizeVerification({ ...effective, github })
        if (receipt.action === 'prepare') {
          await createReleasePullRequest(authorized)
        }
        else if (receipt.action === 'prerelease') {
          const pending = await hasPendingIntents(effective.cwd)
          let ready = !pending
          await releasePrerelease(authorized, async () => {
            ready = true
            return []
          })
          receipt.publish = ready
        }
        receipt.identity = await stageIdentity(options)
        receipt.candidates = source?.selected ?? await getPublishCandidates(effective.cwd)
      }
      else if (['upload', 'confirm', 'finalize'].includes(stage) && receipt.publish) {
        if (receipt.action === 'reconcile') {
          if (stage === 'finalize') {
            await reconcileRelease(effective)
          }
        }
        else {
          const rule = await resolveReleaseBranch(effective)
          const env = getReleaseEnv(effective)
          const name = options.packageName ?? env['REPO_RELEASE_PACKAGE']
          const version = options.packageVersion ?? env['REPO_RELEASE_VERSION']
          const selected = source?.selected ?? (resolveReleaseMode(options) === 'publish-unpublished' ? [{ name: name ?? '', version: version ?? '' }] : undefined)
          if (selected?.some(pkg => !receipt.candidates.some(candidate => candidate.name === pkg.name && candidate.version === pkg.version))) {
            throw new ReleaseCommandError('Recovery package/version does not match prepared candidates')
          }
          await publishLifecycle({ ...effective, stage, github }, selected, rule.distTag)
        }
      }
    }
    else {
      logger.info('No release trigger detected; skipping release CI.')
    }
    if (!receipt.done.includes(stage)) {
      receipt.done.push(stage)
    }
    await stageOutput(options, { run: receipt.action !== 'skip', publish: receipt.publish })
    receipt.identity = await stageIdentity(options)
    receipt.effectiveIdentity = await stageIdentity(effective)
    await reportStage(receipt, options, stage, started, 'complete', effective.cwd)
  }
  catch (error) {
    await reportStage(receipt, options, stage, started, 'failed', effective.cwd)
    throw error
  }
  finally {
    if (effective.cwd !== options.cwd) {
      for (const file of ['repoctl-publish-progress.json', 'repoctl-release-progress.json', 'pnpm-publish-summary.json']) {
        await copyFile(path.join(effective.cwd, file), path.join(options.cwd, file)).catch((error: NodeJS.ErrnoException) => {
          if (error.code !== 'ENOENT') {
            throw error
          }
        })
      }
      if (stage === 'finalize' && receipt.done.includes('finalize')) {
        await rm(path.join(stageDirectory(options), 'source'), { recursive: true, force: true })
      }
    }
  }
  return receipt
}
