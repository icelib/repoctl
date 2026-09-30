import type { PublishedPackage, ReleaseCiOptions } from '../types'
import { readFile } from 'node:fs/promises'
import path from 'pathe'
import { getWorkspacePackages } from '../../../core/workspace'
import { ReleaseCommandError } from '../errors'
import { readLedger } from '../intents'
import { findVersionCommit } from '../lifecycle/identity'
import { releaseStateKey } from '../lifecycle/key'
import { inspectRegistry } from '../lifecycle/registry'
import { readVersionSection } from '../notes/model'
import { getPublishCandidates } from '../publish'
import { packageKey } from '../publish/state'
import { getReleaseEnv } from '../shared'

/** A prepared version belongs to its original source, even before npm accepts it. */
export async function assertPreviousReleaseComplete(options: ReleaseCiOptions, distTag = 'latest') {
  const ledger = await readLedger(options.cwd)
  const candidates = await getPublishCandidates(options.cwd)
  const workspace = await getWorkspacePackages(options.cwd)
  const prepared: PublishedPackage[] = []
  for (const pkg of candidates) {
    if (ledger[packageKey(pkg)]) {
      prepared.push(pkg)
      continue
    }
    const directory = workspace.find(item => item.manifest.name === pkg.name)!.rootDir
    try {
      const changelog = await readFile(path.join(directory, 'CHANGELOG.md'), 'utf8')
      if (readVersionSection(changelog, pkg.version)?.previousVersion) {
        prepared.push(pkg)
      }
    }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error
      }
    }
  }
  if (!prepared.length) {
    return
  }
  const github = options.github
  const releases = github?.listReleases ? await github.listReleases() : undefined
  const repository = getReleaseEnv(options)['GITHUB_REPOSITORY']
  const sources = new Map<string, string>()
  const cohorts = new Map<string, PublishedPackage[]>()
  for (const pkg of prepared) {
    const source = await findVersionCommit(pkg, options)
    sources.set(packageKey(pkg), source)
    cohorts.set(source, [...(cohorts.get(source) ?? []), pkg])
  }
  const unfinished = new Set<string>()
  if (repository && github?.readReleaseState) {
    for (const group of [candidates, ...cohorts.values()]) {
      const key = releaseStateKey(repository, distTag, group)
      const checkpoint = await github.readReleaseState(key)
      if (checkpoint && (!checkpoint.state.complete || checkpoint.state.schemaVersion !== 1)) {
        group.forEach(pkg => unfinished.add(packageKey(pkg)))
      }
    }
  }
  const blocked: string[] = []
  for (const pkg of prepared) {
    const published = await inspectRegistry(pkg, options)
    const release = releases?.find(item => item.tag_name === packageKey(pkg))
    const tag = github?.readTagTarget ? await github.readTagTarget(packageKey(pkg)) : undefined
    if (!published || unfinished.has(packageKey(pkg))
      || (releases && (!release || release.draft || Boolean(release.prerelease) !== (distTag !== 'latest')))
      || (github?.readTagTarget && (!tag || (published.gitHead && tag !== published.gitHead)))) {
      const source = sources.get(packageKey(pkg))!
      const recovery = distTag === 'latest'
        ? `repo release ci --mode publish --source-sha ${source}`
        : `check out ${source} on ${distTag} and run repo release ci`
      blocked.push(`${packageKey(pkg)} (source ${source}); recover with ${recovery}`)
    }
  }
  if (blocked.length) {
    throw new ReleaseCommandError(`Prepared releases must finish before consuming new intents:\n${blocked.join('\n')}`)
  }
}
