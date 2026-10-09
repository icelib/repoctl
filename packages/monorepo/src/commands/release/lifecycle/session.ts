import type { PublishedPackage, ReleaseCiOptions } from '../types'
import type { ReleaseLifecycleState, ReleaseTarget } from './types'
import { randomUUID } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import { performance } from 'node:perf_hooks'
import path from 'pathe'
import semver from 'semver'
import { logger } from '../../../core/logger'
import { ReleaseCommandError } from '../errors'
import { assertReleaseLineVersions, resolveReleaseBranch } from '../lines'
import { resolveGitHub } from '../metadata'
import { getPublishCandidates } from '../publish'
import { packageKey } from '../publish/state'
import { mapConcurrent, registrySettings } from '../registry/settings'
import { getReleaseEnv } from '../shared'
import { findVersionCommit, verifySource } from './identity'
import { releaseStateKey } from './key'
import { inspectRegistry } from './registry'

export async function openLifecycle(options: ReleaseCiOptions, selected?: PublishedPackage[], distTag = 'latest') {
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
  const rule = options.config?.branches ? await resolveReleaseBranch(options) : undefined
  if (rule) {
    assertReleaseLineVersions(rule, candidates)
    if (rule.distTag !== distTag) {
      throw new ReleaseCommandError('Publish tag does not match the configured release line')
    }
  }
  const key = releaseStateKey(repository, distTag, candidates)
  const snapshot = await github.readReleaseState(key)
  let revision = snapshot?.revision
  const releases = new Map((await github.listReleases()).map(release => [release.tag_name, release]))
  const registry = new Map<string, Awaited<ReturnType<typeof inspectRegistry>>>()
  const settings = registrySettings(options)
  const deadline = performance.now() + Math.min(settings.visibilityTimeoutMs, settings.requestTimeoutMs * 6 + 3_000)
  await mapConcurrent(candidates, settings.concurrency, async (pkg) => {
    registry.set(packageKey(pkg), await inspectRegistry(pkg, options, deadline))
  })
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
      if (published && release && !release.draft && Boolean(release.prerelease) === Boolean(semver.prerelease(pkg.version))
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
      return undefined
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
    return { preview: state.packages.map(({ name, version }) => ({ name, version })) }
  }
  state.writer = randomUUID()
  state.complete = false
  const save = async () => {
    await writeFile(path.join(options.cwd, 'repoctl-release-progress.json'), `${JSON.stringify(state, null, 2)}\n`)
    revision = await github.writeReleaseState!(key, state, revision)
  }
  await save()
  const packages = state.packages.map(({ name, version }) => ({ name, version }))
  return { github, env, rule, state, save, packages, registry, releases }
}
