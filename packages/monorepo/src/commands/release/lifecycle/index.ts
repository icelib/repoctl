import type { PublishedPackage, ReleaseCiOptions } from '../types'
import type { openLifecycle } from './session'
import { writeFile } from 'node:fs/promises'
import path from 'pathe'
import semver from 'semver'
import { logger } from '../../../core/logger'
import { ReleaseCommandError } from '../errors'
import { runReleaseHooks } from '../hooks'
import { assertReleaseLineVersions } from '../lines'
import { publishMetadata } from '../metadata'
import { getPublishCandidates, publishWithRetry } from '../publish'
import { confirmVisibility } from '../publish/registry'
import { packageKey, PublishState } from '../publish/state'
import { clearPublishSummary } from '../shared'
import { finishHooks } from './hooks'
import { openLifecycle as open } from './session'

type Session = Exclude<Awaited<ReturnType<typeof openLifecycle>>, undefined | { preview: PublishedPackage[] }>

async function upload(session: Session, options: ReleaseCiOptions, distTag: string) {
  const { state, save, packages, registry, rule } = session
  const confirmed = new PublishState(packages)
  confirmed.accept(state.accepted)
  for (const pkg of packages) {
    if (registry.get(packageKey(pkg))) {
      confirmed.confirm(pkg)
    }
  }
  // Lost upload responses are unknown, never permission to re-upload.
  if (state.npm === 'running' && (!state.uploadComplete || packages.some(pkg => !state.accepted.some(accepted => packageKey(accepted) === packageKey(pkg))))) {
    await confirmVisibility(confirmed, options, packages)
  }
  const missing = confirmed.pendingUploads
  if (missing.length) {
    runReleaseHooks('beforePublish', options)
    const actual = await getPublishCandidates(options.cwd)
    if (missing.some(pkg => !actual.some(item => packageKey(item) === packageKey(pkg)))) {
      throw new ReleaseCommandError('Publish candidates changed during beforePublish hooks; no upload started')
    }
    if (rule) {
      assertReleaseLineVersions(rule, actual)
    }
    await clearPublishSummary(options.cwd)
    state.npm = 'running'
    state.uploadComplete = false
    await save()
    try {
      await publishWithRetry(
        ['publish', '-r', '--report-summary', '--provenance', '--no-git-checks', '--tag', distTag, ...missing.flatMap(pkg => ['--filter', pkg.name])],
        { ...options, deferConfirmation: true },
        packages,
        true,
        { accepted: confirmed.acceptedPackages, save: async (accepted) => {
          state.accepted = accepted
          await save()
        } },
      )
    }
    catch (error) {
      state.npm = 'failed'
      await save()
      throw error
    }
  }
  else {
    state.accepted = confirmed.acceptedPackages
  }
  state.uploadComplete = packages.every(pkg => state.accepted.some(accepted => packageKey(accepted) === packageKey(pkg)))
  await save()
}

async function confirm(session: Session, options: ReleaseCiOptions, distTag: string) {
  const { state, packages, save } = session
  if (state.npm !== 'running' && packages.some(pkg => !state.accepted.some(accepted => packageKey(accepted) === packageKey(pkg)))) {
    throw new ReleaseCommandError('Confirmation requires accepted upload evidence for every release target; run upload first')
  }
  const confirmed = new PublishState(packages, async (accepted) => {
    state.accepted = accepted
    await save()
  })
  confirmed.accept(state.accepted)
  try {
    await confirmVisibility(confirmed, options, packages, 0, distTag)
  }
  catch (error) {
    state.npm = 'failed'
    await save()
    throw error
  }
  state.npm = 'complete'
  state.accepted = packages
  await save()
  await writeFile(path.join(options.cwd, 'pnpm-publish-summary.json'), JSON.stringify({ publishedPackages: packages }))
}

async function finalize(session: Session, options: ReleaseCiOptions) {
  const { github, state, packages, releases, env, save } = session
  if (state.npm !== 'complete') {
    throw new ReleaseCommandError('Finalize requires completed version/dist-tag confirmation; run confirm first')
  }
  for (const pkg of state.packages) {
    await github.ensureTag!({ tag: packageKey(pkg), target: pkg.target })
    const release = releases.get(packageKey(pkg))
    if (!release || release.draft || Boolean(release.prerelease) !== Boolean(semver.prerelease(pkg.version))) {
      await publishMetadata([pkg], { ...options, env: { ...env, GITHUB_SHA: pkg.target } }, Boolean(semver.prerelease(pkg.version)))
    }
    if (!state.metadata.includes(packageKey(pkg))) {
      state.metadata.push(packageKey(pkg))
      await save()
    }
  }
  await finishHooks(state, save, options)
  state.complete = true
  await save()
  logger.success(`Release lifecycle complete: ${packages.map(packageKey).join(', ')}`)
}

export async function publishLifecycle(options: ReleaseCiOptions, selected?: PublishedPackage[], distTag = 'latest') {
  const session = await open(options, selected, distTag)
  if (!session) {
    return []
  }
  if ('preview' in session) {
    return session.preview
  }
  const stage = options.stage ?? 'all'
  if (stage === 'all' || stage === 'upload') {
    await upload(session, options, distTag)
  }
  if (stage === 'all' || stage === 'confirm') {
    await confirm(session, options, distTag)
  }
  if (stage === 'all' || stage === 'finalize') {
    await finalize(session, options)
  }
  return session.packages
}
