import type { PublishedPackage, ReleaseOptions } from '../types'
import { readFile, realpath } from 'node:fs/promises'
import path from 'pathe'
import { getWorkspacePackages } from '../../../core/workspace'
import { ReleaseCommandError } from '../errors'
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
  let current: string
  try {
    current = await readFile(path.join(options.cwd, changelog), 'utf8')
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return
    }
    throw error
  }
  if (capture('git', ['show', `${target}:${changelog}`], options).replace(/\r\n/g, '\n').trim() !== current.replace(/\r\n/g, '\n').trim()) {
    throw new ReleaseCommandError(`Changelog differs from original commit for ${pkg.name}; check out ${target} before recovery`)
  }
}

/** 从完整 Git 历史定位当前版本首次进入主线的提交，忽略后续 CI 修复。 */
export async function findVersionCommit(pkg: PublishedPackage, options: ReleaseOptions) {
  const workspace = (await getWorkspacePackages(options.cwd)).find(item => item.manifest.name === pkg.name)
  if (!workspace || capture('git', ['rev-parse', '--is-shallow-repository'], options) !== 'false') {
    throw new ReleaseCommandError('Release source discovery requires a full checkout (fetch-depth: 0)')
  }
  const relative = path.relative(await realpath(options.cwd), workspace.pkgJsonPath)
  const commits = capture('git', ['log', '--format=%H', '--', relative], options).split('\n').filter(Boolean)
  let target = ''
  for (const commit of commits) {
    const original = JSON.parse(capture('git', ['show', `${commit}:${relative}`], options)) as PublishedPackage
    if (original.name !== pkg.name || original.version !== pkg.version) {
      break
    }
    target = commit
  }
  if (!target) {
    throw new ReleaseCommandError(`Cannot find version commit for ${pkg.name}@${pkg.version}; commit the prepared versions first`)
  }
  return target
}
