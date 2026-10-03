import type { PublishedPackage, ReleaseOptions } from '../types'
import { readFile, realpath } from 'node:fs/promises'
import path from 'pathe'
import { getWorkspacePackages } from '../../../core/workspace'
import { ReleaseCommandError } from '../errors'
import { parseLedger, readLedger } from '../intents'
import { capture } from '../shared'

/** 用原提交中的 manifest/changelog 校验版本归属，禁止以重跑 HEAD 偷换来源。 */
export async function verifySource(pkg: PublishedPackage, target: string, options: ReleaseOptions) {
  if (!/^[a-f0-9]{40}$/.test(target)) {
    throw new ReleaseCommandError(`Cannot establish original commit for ${pkg.name}@${pkg.version}; restore its checkpoint or use an explicit verified source commit`)
  }
  const workspace = (await getWorkspacePackages(options.cwd)).find(item => item.manifest.name === pkg.name)
  if (!workspace) {
    throw new ReleaseCommandError(`Release package is absent from workspace: ${pkg.name}`)
  }
  const relative = path.relative(await realpath(options.cwd), workspace.pkgJsonPath)
  const original = JSON.parse(capture('git', ['show', `${target}:${relative}`], options)) as { name?: string, version?: string }
  if (original.name !== pkg.name || original.version !== pkg.version) {
    throw new ReleaseCommandError(`Original commit does not contain ${pkg.name}@${pkg.version}`)
  }
  const changelog = path.join(path.dirname(relative), 'CHANGELOG.md')
  let current: string | undefined
  try {
    current = await readFile(path.join(options.cwd, changelog), 'utf8')
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error
    }
  }
  const hasOriginal = Boolean(capture('git', ['ls-tree', target, '--', changelog], options))
  if (!hasOriginal && current === undefined) {
    return
  }
  if (!hasOriginal || current === undefined
    || capture('git', ['show', `${target}:${changelog}`], options).replace(/\r\n/g, '\n').trim() !== current.replace(/\r\n/g, '\n').trim()) {
    throw new ReleaseCommandError(`Changelog differs from original commit for ${pkg.name}; check out ${target} before recovery`)
  }
}

/** Follow the current identity back to its introduction on the first-parent line. */
function findIntroduction(file: string, matches: (content: string) => boolean, options: ReleaseOptions) {
  const commits = capture('git', ['log', '--first-parent', '--format=%H', '--', file], options).split('\n').filter(Boolean)
  let target = ''
  for (const commit of commits) {
    if (!capture('git', ['ls-tree', commit, '--', file], options)
      || !matches(capture('git', ['show', `${commit}:${file}`], options))) {
      break
    }
    target = commit
  }
  return target
}

/** 从完整 Git 历史定位当前版本首次进入主线的提交，忽略后续 CI 修复。 */
export async function findVersionCommit(pkg: PublishedPackage, options: ReleaseOptions) {
  const workspace = (await getWorkspacePackages(options.cwd)).find(item => item.manifest.name === pkg.name)
  if (!workspace || capture('git', ['rev-parse', '--is-shallow-repository'], options) !== 'false') {
    throw new ReleaseCommandError('Release source discovery requires a full checkout (fetch-depth: 0)')
  }
  const key = `${pkg.name}@${pkg.version}`
  const hasLedgerEntry = Boolean((await readLedger(options.cwd))[key])
  const relative = path.relative(await realpath(options.cwd), workspace.pkgJsonPath)
  // Initial publication may retain the manifest version; the ledger records preparation.
  const target = hasLedgerEntry
    ? findIntroduction('.changeset/ledger.yaml', content => Boolean(parseLedger(content)[key]), options)
    : findIntroduction(relative, (content) => {
        const original = JSON.parse(content) as PublishedPackage
        return original.name === pkg.name && original.version === pkg.version
      }, options)
  if (!target) {
    throw new ReleaseCommandError(`Cannot find ${hasLedgerEntry ? 'prepared release' : 'version'} commit for ${key}; commit the prepared versions first`)
  }
  await verifySource(pkg, target, options)
  return target
}
