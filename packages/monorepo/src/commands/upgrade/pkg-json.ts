import type { PackageJson } from '../../types'
import { coerce, gte, minVersion } from 'semver'
import { version as pkgVersion } from '../../constants'
import { scriptsEntries } from './scripts'

const NON_OVERRIDABLE_PREFIXES = ['workspace:', 'catalog:']

function isCatalogSpecifier(version: string) {
  return version.startsWith('catalog:')
}
const legacyToolPackageName = '@icebreakers/monorepo'
const legacyReleaseDependencies = ['@changesets/cli', '@icebreakers/changelog-github']

function parseVersion(input: unknown) {
  if (typeof input !== 'string' || input.trim().length === 0) {
    return null
  }
  try {
    return minVersion(input) ?? coerce(input)
  }
  catch {
    return null
  }
}

function hasNonOverridablePrefix(version?: string) {
  if (typeof version !== 'string') {
    return false
  }
  return NON_OVERRIDABLE_PREFIXES.some(prefix => version.startsWith(prefix))
}

function shouldAssignVersion(currentVersion: unknown, nextVersion: string) {
  if (typeof currentVersion !== 'string' || currentVersion.trim().length === 0) {
    return true
  }

  if (currentVersion === nextVersion) {
    return false
  }

  const current = parseVersion(currentVersion)
  const next = parseVersion(nextVersion)
  if (!current || !next) {
    return true
  }

  return !gte(current, next)
}

/**
 * 将内置 package.json 内容合并进目标工程：
 * - 同步依赖（保留 workspace: 前缀的版本）
 * - 确保 repoctl 使用最新版本
 * - 写入预置脚本
 */
export function setPkgJson(
  sourcePkgJson: PackageJson,
  targetPkgJson: PackageJson,
  options?: {
    scripts?: Record<string, string>
    preserveLegacyRelease?: boolean
  },
) {
  const packageManager = sourcePkgJson.packageManager ?? ''
  const sourceDeps = sourcePkgJson.dependencies ?? {}
  const sourceDevDeps = sourcePkgJson.devDependencies ?? {}

  const targetDeps = { ...(targetPkgJson.dependencies ?? {}) }
  const targetDevDeps = { ...(targetPkgJson.devDependencies ?? {}) }
  const shouldEnsureRepoctl = Boolean(
    sourceDevDeps['repoctl']
    || sourceDevDeps[legacyToolPackageName]
    || targetDevDeps['repoctl']
    || targetDevDeps[legacyToolPackageName],
  )

  if (packageManager && !targetPkgJson.packageManager) {
    targetPkgJson.packageManager = packageManager
  }

  for (const [depName, depVersion] of Object.entries(sourceDeps)) {
    if (typeof depVersion !== 'string') {
      continue
    }
    if (isCatalogSpecifier(depVersion)) {
      continue
    }

    const targetVersion = targetDeps[depName]
    if (hasNonOverridablePrefix(targetVersion)) {
      continue
    }
    if (shouldAssignVersion(targetVersion, depVersion)) {
      targetDeps[depName] = depVersion
    }
  }
  if (Object.keys(targetDeps).length) {
    targetPkgJson.dependencies = targetDeps
  }

  for (const [depName, depVersion] of Object.entries(sourceDevDeps)) {
    if (typeof depVersion !== 'string') {
      continue
    }
    if (isCatalogSpecifier(depVersion)) {
      continue
    }

    if (depName === 'repoctl') {
      const nextVersion = `^${pkgVersion}`
      const targetVersion = targetDevDeps[depName]
      if (!hasNonOverridablePrefix(targetVersion) && shouldAssignVersion(targetVersion, nextVersion)) {
        targetDevDeps[depName] = nextVersion
      }
    }
    else if (depName === legacyToolPackageName) {
      delete targetDevDeps[legacyToolPackageName]
    }
    else {
      const targetVersion = targetDevDeps[depName]
      if (hasNonOverridablePrefix(targetVersion)) {
        continue
      }
      if (shouldAssignVersion(targetVersion, depVersion)) {
        targetDevDeps[depName] = depVersion
      }
    }
  }
  if (legacyToolPackageName in targetDevDeps && 'repoctl' in targetDevDeps) {
    delete targetDevDeps[legacyToolPackageName]
  }
  if (!options?.preserveLegacyRelease) {
    for (const dependency of legacyReleaseDependencies) {
      delete targetDeps[dependency]
      delete targetDevDeps[dependency]
    }
  }
  if (shouldEnsureRepoctl) {
    const nextVersion = `^${pkgVersion}`
    const targetVersion = targetDevDeps['repoctl']
    if (!hasNonOverridablePrefix(targetVersion) && shouldAssignVersion(targetVersion, nextVersion)) {
      targetDevDeps['repoctl'] = nextVersion
    }
    delete targetDevDeps[legacyToolPackageName]
  }
  if (Object.keys(targetDevDeps).length) {
    targetPkgJson.devDependencies = targetDevDeps
  }

  const scriptPairs = options?.scripts ? Object.entries(options.scripts) : scriptsEntries
  if (scriptPairs.length) {
    const scripts = { ...(targetPkgJson.scripts ?? {}) }
    for (const [scriptName, scriptCmd] of scriptPairs) {
      scripts[scriptName] = scriptCmd
    }
    targetPkgJson.scripts = scripts
  }
}
