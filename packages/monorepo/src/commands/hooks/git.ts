import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

interface HooksPathSetting {
  scope: string
  origin: string
  value: string
}

export function runHookGit(cwd: string, env: NodeJS.ProcessEnv, args: string[]) {
  const result = spawnSync('git', args, { cwd, env, encoding: 'utf8' })
  if (result.error) {
    throw result.error
  }
  return result
}

export function hookRepositoryRoot(cwd: string, env: NodeJS.ProcessEnv) {
  const result = runHookGit(cwd, env, ['rev-parse', '--show-toplevel'])
  return result.status === 0 ? path.resolve(result.stdout.trim()) : undefined
}

function hooksPathSettings(cwd: string, env: NodeJS.ProcessEnv): HooksPathSetting[] {
  const result = runHookGit(cwd, env, ['config', '--null', '--show-scope', '--show-origin', '--get-all', 'core.hooksPath'])
  if (result.status === 1) {
    return []
  }
  if (result.status !== 0) {
    throw new Error('Could not inspect Git core.hooksPath.')
  }
  const fields = result.stdout.split('\0')
  const settings: HooksPathSetting[] = []
  for (let index = 0; index + 2 < fields.length; index += 3) {
    settings.push({ scope: fields[index]!, origin: fields[index + 1]!, value: fields[index + 2]! })
  }
  return settings
}

export function effectiveHooksPath(cwd: string, env: NodeJS.ProcessEnv) {
  return hooksPathSettings(cwd, env).at(-1)?.value
}

function canonical(filename: string) {
  return fs.existsSync(filename) ? fs.realpathSync(filename) : path.resolve(filename)
}

/** Return the checkout owning a directly configured, repository-local Husky path. */
export function ownedHuskySetting(cwd: string, env: NodeJS.ProcessEnv) {
  const settings = hooksPathSettings(cwd, env)
  const effective = settings.at(-1)
  if (!effective || !['local', 'worktree'].includes(effective.scope)) {
    return undefined
  }
  const gitDirectory = runHookGit(cwd, env, ['rev-parse', effective.scope === 'local' ? '--git-common-dir' : '--git-dir'])
  if (gitDirectory.status !== 0) {
    return undefined
  }
  const directory = path.resolve(cwd, gitDirectory.stdout.trim())
  const config = canonical(path.join(directory, effective.scope === 'local' ? 'config' : 'config.worktree'))
  const scoped = settings.filter(setting => setting.scope === effective.scope)
  if (scoped.length !== 1 || !effective.origin.startsWith('file:')
    || canonical(path.resolve(cwd, effective.origin.slice(5))) !== config) {
    return undefined
  }
  const absolute = path.resolve(cwd, effective.value)
  if (![path.join(cwd, '.husky'), path.join(cwd, '.husky', '_')].includes(absolute)) {
    return undefined
  }
  // A linked worktree shares local config with the main checkout. Inspect its hooks too.
  const owner = effective.scope === 'local' && path.basename(directory) === '.git' ? path.dirname(directory) : cwd
  if (owner !== cwd && path.isAbsolute(effective.value)) {
    return undefined
  }
  return { scope: effective.scope as 'local' | 'worktree', owner }
}

export function unsetOwnedHuskySetting(cwd: string, env: NodeJS.ProcessEnv, scope: 'local' | 'worktree') {
  const result = runHookGit(cwd, env, ['config', `--${scope}`, '--unset-all', 'core.hooksPath'])
  if (result.status !== 0) {
    throw new Error('Could not remove the repository-local Husky hooks path.')
  }
}
