import type { PublishedPackage, ReleaseCiOptions } from '../types'
import type { ReleaseLifecycleState, ReleaseTarget } from './types'
import { randomUUID } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import path from 'pathe'
import { logger } from '../../../core/logger'
import { ReleaseCommandError } from '../errors'
import { runReleaseHooks } from '../hooks'
import { publishMetadata, resolveGitHub } from '../metadata'
import { getPublishCandidates, publishWithRetry } from '../publish'
import { confirmVisibility } from '../publish/registry'
import { packageKey, PublishState } from '../publish/state'
import { clearPublishSummary, getReleaseEnv } from '../shared'
import { finishHooks } from './hooks'
import { findVersionCommit, verifySource } from './identity'
import { releaseStateKey } from './key'
import { inspectRegistry } from './registry'

export async function publishLifecycle(options: ReleaseCiOptions, selected?: PublishedPackage[], distTag = 'latest') {
  const github = resolveGitHub(options)
  if (!github.readReleaseState || !github.writeReleaseState || !github.ensureTag || !github.listReleases) {
    throw new ReleaseCommandError('Release recovery requires checkpoint, tag and release query operations')
  }
  const env = getReleaseEnv(options)
  const repository = env['GITHUB_REPOSITORY']
  if (!repository || !/^[^/]+\/[^/]+$/.test(repository)) {
    throw new ReleaseCommandError('GITHUB_REPOSITORY is required for durable release recovery')
  }
  const candidates = selected ?? await getPublishCandidates(options.cwd)
  const key = releaseStateKey(repository, distTag, candidates)
  const snapshot = await github.readReleaseState(key)
  let revision = snapshot?.revision
  const releases = new Map((await github.listReleases()).map(release => [release.tag_name, release]))
  const registry = new Map<string, Awaited<ReturnType<typeof inspectRegistry>>>()
  for (const pkg of candidates) {
    registry.set(packageKey(pkg), await inspectRegistry(pkg, options))
  }
  const tags = new Map<string, string | undefined>()
  if (github.readTagTarget) {
    for (const pkg of candidates) {
      tags.set(packageKey(pkg), await github.readTagTarget(packageKey(pkg)))
    }
  }
  let state: ReleaseLifecycleState
  if (snapshot) {
    state = snapshot.state
    if (state.schemaVersion !== 1 || state.repository !== repository
      || JSON.stringify(state.candidates.map(packageKey).sort()) !== JSON.stringify(candidates.map(packageKey).sort())
      || state.packages.some(pkg => !candidates.some(candidate => packageKey(candidate) === packageKey(pkg)))) {
      throw new ReleaseCommandError('Release checkpoint identity does not match this repository and exact versions')
    }
  }
  else {
    const packages: ReleaseTarget[] = []
    for (const pkg of candidates) {
      const published = registry.get(packageKey(pkg))
      const release = releases.get(packageKey(pkg))
      const tagTarget = tags.get(packageKey(pkg))
      if (published && release && !release.draft && Boolean(release.prerelease) === (distTag !== 'latest')
        && (!github.readTagTarget || tagTarget)) {
        if (published.gitHead && tagTarget && published.gitHead !== tagTarget) {
          throw new ReleaseCommandError(`Tag target conflict for ${packageKey(pkg)}`)
        }
        continue
      }
      const target = published
        ? published.gitHead ?? env['REPO_RELEASE_SOURCE_SHA'] ?? ''
        : env['REPO_RELEASE_SOURCE_SHA'] ?? await findVersionCommit(pkg, options)
      await verifySource(pkg, target, options)
      packages.push({ ...pkg, target })
    }
    // 同一原提交中已完成元数据的包仍属于此次收尾目标，保持 hook 的完整包集合。
    const targets = new Set(packages.map(pkg => pkg.target))
    for (const pkg of candidates) {
      const source = registry.get(packageKey(pkg))?.gitHead
      if (source && targets.has(source) && !packages.some(item => packageKey(item) === packageKey(pkg))) {
        await verifySource(pkg, source, options)
        packages.push({ ...pkg, target: source })
      }
    }
    if (!packages.length) {
      logger.info('No unfinished release targets found.')
      return []
    }
    // 无旧阶段记录的历史版本不能证明 hook 未执行过。
    const legacy = packages.some(pkg => registry.has(packageKey(pkg)) && registry.get(packageKey(pkg)))
    state = {
      schemaVersion: 1,
      writer: '',
      repository,
      candidates,
      packages,
      accepted: packages.filter(pkg => registry.get(packageKey(pkg))).map(({ name, version }) => ({ name, version })),
      npm: 'pending',
      metadata: [],
      complete: false,
      hooks: Object.fromEntries((options.config?.hooks?.afterPublish ?? []).map(hook => [hook.script, legacy ? 'running' : 'pending'])),
    }
  }
  const scripts = (options.config?.hooks?.afterPublish ?? []).map(hook => hook.script)
  if (new Set(scripts).size !== scripts.length || JSON.stringify(Object.keys(state.hooks).sort()) !== JSON.stringify([...scripts].sort())) {
    throw new ReleaseCommandError('afterPublish scripts must be unique and match the persisted release; restore the original hook configuration')
  }
  for (const pkg of state.packages) {
    await verifySource(pkg, pkg.target, options)
    const target = tags.get(packageKey(pkg))
    if (target && target !== pkg.target) {
      throw new ReleaseCommandError(`Tag target conflict for ${packageKey(pkg)}`)
    }
  }
  if (options.dryRun ?? env['REPO_RELEASE_DRY_RUN'] === 'true') {
    logger.info(JSON.stringify({ key, packages: state.packages, npm: state.npm, tags: state.packages.filter(pkg => !tags.get(packageKey(pkg))).map(packageKey), metadata: state.packages.filter(pkg => !releases.has(packageKey(pkg))).map(packageKey), hooks: state.hooks }, null, 2))
    return state.packages.map(({ name, version }) => ({ name, version }))
  }
  state.writer = randomUUID()
  state.complete = false
  const save = async () => {
    await writeFile(path.join(options.cwd, 'repoctl-release-progress.json'), `${JSON.stringify(state, null, 2)}\n`)
    revision = await github.writeReleaseState!(key, state, revision)
  }
  await save()
  const packages = state.packages.map(({ name, version }) => ({ name, version }))
  const confirmed = new PublishState(packages)
  confirmed.accept(state.accepted)
  for (const pkg of packages) {
    if (registry.get(packageKey(pkg))) {
      confirmed.confirm(pkg)
    }
  }
  // runner 在上传期间消失时，尚未落盘的响应也可能已经被 npm 接收。
  if (state.npm === 'running') {
    await confirmVisibility(confirmed, options, packages)
  }
  else if (confirmed.unconfirmed(state.accepted).length) {
    await confirmVisibility(confirmed, options, state.accepted)
  }
  const missing = packages.filter(pkg => !confirmed.acceptedPackages.some(item => packageKey(item) === packageKey(pkg)))
  if (missing.length) {
    runReleaseHooks('beforePublish', options)
    await clearPublishSummary(options.cwd)
    state.npm = 'running'
    state.complete = false
    await save()
    try {
      await publishWithRetry(
        ['publish', '-r', '--report-summary', '--provenance', '--no-git-checks', '--tag', distTag, ...missing.flatMap(pkg => ['--filter', pkg.name])],
        options,
        packages,
        true,
        {
          accepted: confirmed.acceptedPackages,
          save: async (accepted) => {
            state.accepted = accepted
            await save()
          },
        },
      )
    }
    catch (error) {
      state.npm = 'failed'
      await save()
      throw error
    }
  }
  for (const pkg of packages) {
    const remote = await inspectRegistry(pkg, options)
    if (!remote || remote['dist-tags']?.[distTag] !== pkg.version) {
      throw new ReleaseCommandError(`npm version/dist-tag ${distTag} is not confirmed for ${packageKey(pkg)}; release remains incomplete`)
    }
  }
  state.npm = 'complete'
  state.accepted = packages
  await save()
  await writeFile(path.join(options.cwd, 'pnpm-publish-summary.json'), JSON.stringify({ publishedPackages: packages }))
  for (const pkg of state.packages) {
    await github.ensureTag({ tag: packageKey(pkg), target: pkg.target })
    const release = releases.get(packageKey(pkg))
    if (!release || release.draft || Boolean(release.prerelease) !== (distTag !== 'latest')) {
      await publishMetadata([pkg], { ...options, env: { ...env, GITHUB_SHA: pkg.target } }, distTag !== 'latest')
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
  return packages
}
