import type { PackageJson } from '../../types'
import type { GitHooksInstallOptions, GitHooksInstallResult } from './types'
import { lstat, readFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import crossSpawn from 'cross-spawn'
import { loadMonorepoConfig } from '../../core/config'
import { inspectLegacyHooks } from '../upgrade/hooks/inspect'
import { applyHookChecks, prepareHookChecks } from './checks'
import { effectiveHooksPath, hookRepositoryRoot, ownedHuskySetting, unsetOwnedHuskySetting } from './git'

export type { GitHookCheck, GitHooksConfig, GitHooksInstallOptions, GitHooksInstallResult } from './types'

function enabled(value: string | undefined) {
  return Boolean(value && value !== '0' && value !== 'false')
}

async function safeLegacyHooks(cwd: string) {
  try {
    if ((await lstat(path.join(cwd, '.husky'))).isSymbolicLink()) {
      return false
    }
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error
    }
  }
  let pkg: PackageJson = {}
  try {
    pkg = JSON.parse(await readFile(path.join(cwd, 'package.json'), 'utf8'))
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error
    }
  }
  // Installation does not replace prepare. It may already invoke this public command.
  const legacy = await inspectLegacyHooks(cwd, { ...pkg, scripts: { ...pkg.scripts, prepare: undefined } })
  return !legacy.custom
}

/**
 * Install native Lefthook hooks without overriding custom or inherited Git hook paths.
 * Use `prepare: "repo tooling hooks install"` with `allowBuilds.lefthook: false`
 * so Lefthook's own postinstall cannot install hooks before this safety check.
 * CI and disabled hooks skip before project configuration is evaluated.
 */
export async function installGitHooks(cwd: string, options: GitHooksInstallOptions = {}): Promise<GitHooksInstallResult> {
  const env = options.env ?? process.env
  const result: GitHooksInstallResult = { status: 'skipped', migrated: false, configuredChecks: [] }
  // Prepare must remain safe in CI, including when the config module cannot execute there.
  if (enabled(env['CI'])) {
    return { ...result, reason: 'ci' }
  }
  if (env['LEFTHOOK'] === '0' || env['LEFTHOOK'] === 'false') {
    return { ...result, reason: 'disabled' }
  }
  const root = hookRepositoryRoot(path.resolve(cwd), env)
  if (!root) {
    return { ...result, reason: 'not-git' }
  }
  let hooksPath = effectiveHooksPath(root, env)
  const owned = hooksPath === undefined ? undefined : ownedHuskySetting(root, env)
  if (hooksPath !== undefined) {
    if (!owned) {
      return { ...result, reason: 'custom-hooks-path', hooksPath }
    }
    if (!await safeLegacyHooks(root) || (owned.owner !== root && !await safeLegacyHooks(owned.owner))) {
      return { ...result, reason: 'custom-husky', hooksPath }
    }
  }
  const config = await loadMonorepoConfig(root)
  const checks = await prepareHookChecks(root, config.tooling?.hooks?.preCommit)
  if (owned) {
    // Validate native and project configuration before changing any Git setting.
    unsetOwnedHuskySetting(root, env, owned.scope)
    result.migrated = true
    // Removing local config can expose a global, system, included, or worktree value.
    hooksPath = effectiveHooksPath(root, env)
    if (hooksPath !== undefined) {
      return { ...result, reason: 'custom-hooks-path', hooksPath }
    }
  }
  await applyHookChecks(checks)
  result.configuredChecks = checks.names
  const installed = crossSpawn.sync('pnpm', ['exec', 'lefthook', 'install'], { cwd: root, env, encoding: 'utf8' })
  if (installed.error || installed.status !== 0) {
    throw new Error(`Lefthook installation failed. ${installed.stderr?.trim() || installed.error?.message || 'Run pnpm install and retry.'}`)
  }
  return { ...result, status: 'installed' }
}
