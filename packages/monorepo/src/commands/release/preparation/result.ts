import type { ReleaseOptions } from '../types'
import semver from 'semver'
import { readWorkspaceVersions } from '../body'
import { ReleaseCommandError } from '../errors'
import { capture } from '../shared'

export interface AppliedRelease {
  name: string
  currentVersion: string
  newVersion: string
}

export async function applyVersions(options: ReleaseOptions): Promise<AppliedRelease[]> {
  const before = await readWorkspaceVersions(options.cwd, { includePrivate: true, includeRoot: true })
  const output = capture('pnpm', ['version', '-r', '--no-git-checks', '--json'], options)
  let data: unknown
  try {
    data = JSON.parse(output)
  }
  catch {
    throw new ReleaseCommandError('pnpm version returned invalid JSON; no release PR will be pushed')
  }
  if (!Array.isArray(data)) {
    throw new ReleaseCommandError('pnpm version must return an applied release array')
  }
  const after = await readWorkspaceVersions(options.cwd, { includePrivate: true, includeRoot: true })
  const names = new Set<string>()
  for (const item of data) {
    if (!item || typeof item.name !== 'string' || names.has(item.name)
      || typeof item.currentVersion !== 'string' || !semver.valid(item.currentVersion)
      || typeof item.newVersion !== 'string' || !semver.valid(item.newVersion)
      || before.get(item.name) !== item.currentVersion || after.get(item.name) !== item.newVersion) {
      throw new ReleaseCommandError('pnpm version result does not match workspace manifests')
    }
    names.add(item.name)
  }
  for (const [name, version] of after) {
    if (before.get(name) !== version && !names.has(name)) {
      throw new ReleaseCommandError(`pnpm version omitted changed package ${name}`)
    }
  }
  return data as AppliedRelease[]
}
