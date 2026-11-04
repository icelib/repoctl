import type { BootstrapOptions, BootstrapPlan } from './types'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { prerelease, valid } from 'semver'
import validatePackageName from 'validate-npm-package-name'
import { readReleaseBranches } from '../lines'
import { snapshotCommand } from '../snapshot/process'
import { assertBootstrapPreparationEnvironment } from './preparation/environment'
import { bootstrapSource, bootstrapSourceDirectory } from './preparation/source'
import { bootstrapWorkspace } from './preparation/workspace'
import { validateBootstrapTag } from './schema'

/** 冻结单包预发布与稳定发布线保护，不执行安装、构建或生命周期。 */
export async function createBootstrapPlan(options: BootstrapOptions): Promise<BootstrapPlan> {
  assertBootstrapPreparationEnvironment(options)
  if (!validatePackageName(options.packageName).validForNewPackages || !valid(options.version) || !prerelease(options.version) || options.version !== valid(options.version)) {
    throw new Error('Bootstrap requires an exact package name and an explicit canonical semver prerelease version.')
  }
  const tag = validateBootstrapTag(options.tag ?? 'alpha')
  if (options.registry !== undefined && options.registry !== 'https://registry.npmjs.org/' && options.registry !== 'https://registry.npmjs.org') {
    throw new Error('Bootstrap only supports the official public npm registry.')
  }
  const source = await bootstrapSource(options)
  const root = await bootstrapSourceDirectory(options, source)
  const protectedTags = [...new Set(['latest', ...(await readReleaseBranches({ ...options, cwd: root })).filter(rule => rule.kind !== 'prerelease').map(rule => rule.distTag)])].sort()
  if (protectedTags.includes(tag)) {
    throw new Error('Bootstrap cannot use a dist-tag reserved by a stable or maintenance release line.')
  }
  const { target, buildDirectories } = await bootstrapWorkspace(root, options.packageName)
  if (!target.manifest.version || !valid(target.manifest.version)) {
    throw new Error('Bootstrap target requires a valid committed package version.')
  }
  const manifest = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8')) as { packageManager?: string }
  const pin = /^pnpm@(\d+\.\d+\.\d+)(?:\+sha\d+\.[a-f0-9]+)?$/u.exec(manifest.packageManager ?? '')
  if (!pin || snapshotCommand('pnpm', ['--version'], { ...options, cwd: root }) !== pin[1]) {
    throw new Error('Bootstrap requires the trusted pnpm version to match the frozen packageManager pin.')
  }
  await bootstrapSourceDirectory(options, source)
  return {
    schemaVersion: 1,
    source,
    package: { name: options.packageName, directory: path.relative(root, target.rootDir).split(path.sep).join('/'), currentVersion: target.manifest.version, version: options.version },
    registry: 'https://registry.npmjs.org/',
    tag,
    pnpmVersion: pin[1],
    buildDirectories,
    protectedTags,
  }
}
