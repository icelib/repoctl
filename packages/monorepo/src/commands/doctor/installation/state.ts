import type { DoctorCheck, DoctorContext } from '../types'
import type { Data } from './lockfile'
import { isDeepStrictEqual } from 'node:util'
import path from 'pathe'
import { eq } from 'semver'
import { localize } from '../../../i18n'
import fs from '../../../utils/fs'
import { declaredPnpmVersion } from '../runtime/pnpm'
import { dependencyGroups, readLockfile, readYaml, record } from './lockfile'

export async function checkInstallation(
  context: DoctorContext,
  wanted: Data | undefined,
  lockCheck: DoctorCheck,
  manifests: { dir: string, manifest: Data }[],
): Promise<DoctorCheck> {
  const { workspaceDir, packageJson } = context
  const modulesDir = path.join(workspaceDir, 'node_modules')
  const result = (status: DoctorCheck['status'], en: string, zh: string): DoctorCheck => ({
    id: 'installation-state',
    title: localize('Recorded installation state', '安装记录状态'),
    status,
    detail: localize(en, zh),
    ...(status !== 'pass'
      ? { fix: status === 'warn'
          ? localize('Review the evidence limit and validate with the declared pnpm version. Explicitly run pnpm install if the installation is missing or stale; unsupported layouts remain unknown.', '检查证据限制并使用声明的 pnpm 版本手动验证。缺少安装或安装过期时手动运行 pnpm install；不支持的布局仍会显示未知。')
          : localize('Review the lockfile diagnostics, then explicitly run pnpm install with the declared pnpm version. This check never installs dependencies.', '检查锁文件诊断后，手动使用声明的 pnpm 版本执行 pnpm install。本检查不会安装依赖。') }
      : {}),
  })
  if (!await fs.pathExists(modulesDir)) {
    return result('warn', 'No root node_modules: no installation evidence was found.', '根目录没有 node_modules，未发现安装证据。')
  }
  const metadata = (await readYaml(path.join(modulesDir, '.modules.yaml')))?.[0]
  const installedBy = declaredPnpmVersion(metadata?.['packageManager'])
  if (!metadata || metadata['layoutVersion'] !== 5 || !installedBy || typeof metadata['virtualStoreDir'] !== 'string') {
    return result('warn', 'Installation state is unknown: node_modules has missing or unsupported pnpm metadata.', '安装状态未知：node_modules 缺少 pnpm 元数据或其格式不受支持。')
  }
  if (metadata['nodeLinker'] && metadata['nodeLinker'] !== 'isolated') {
    return result('warn', 'Installation state is unknown: only the isolated pnpm node linker is supported.', '安装状态未知：当前仅支持 pnpm isolated node linker。')
  }
  const declared = declaredPnpmVersion(packageJson['packageManager'])
  if (declared && !eq(installedBy, declared)) {
    return result('fail', `Dependencies were installed by pnpm ${installedBy}, but packageManager declares ${declared}.`, `依赖由 pnpm ${installedBy} 安装，但 packageManager 声明 ${declared}。`)
  }
  const included = record(metadata['included'])
  if (dependencyGroups.some(group => included?.[group] !== true)) {
    return result('warn', 'Installation is partial or unknown: not all dependency groups were included.', '安装不完整或状态未知：未包含所有依赖类型。')
  }
  const current = await readLockfile(path.resolve(modulesDir, metadata['virtualStoreDir'], 'lock.yaml'))
  if (!wanted || !current) {
    return result('warn', 'Installation state is unknown: a supported workspace and installed lockfile are both required.', '安装状态未知：需要可识别的 workspace 锁文件和安装锁文件。')
  }
  for (const field of ['importers', 'packages', 'snapshots', 'settings', 'overrides', 'catalogs', 'patchedDependencies']) {
    if (!isDeepStrictEqual(wanted[field], current[field])) {
      return result('fail', `Installed lockfile differs from pnpm-lock.yaml (${field}); the recorded installation is stale.`, `安装锁文件与 pnpm-lock.yaml 不同（${field}），安装记录已过期。`)
    }
  }
  if (lockCheck.status !== 'pass') {
    return result(lockCheck.status, 'Installation cannot be confirmed until manifest/lockfile consistency is resolved.', '需要先确认清单与锁文件一致，才能确认安装记录。')
  }
  for (const { dir, manifest } of manifests) {
    for (const group of ['dependencies', 'devDependencies'] as const) {
      for (const name of Object.keys(record(manifest[group]) ?? {})) {
        if (name in (record(manifest['optionalDependencies']) ?? {})) {
          continue
        }
        if (!await fs.pathExists(path.join(workspaceDir, dir, 'node_modules', name, 'package.json'))) {
          return result('fail', `Installed direct dependency is missing: ${dir}: ${name}.`, `已安装的直接依赖缺失：${dir}：${name}。`)
        }
      }
    }
  }
  return result('pass', 'Manifest specifiers, lockfiles and recorded pnpm installation agree; required direct dependency manifests exist. Package integrity and build scripts were not checked.', '依赖声明、锁文件与 pnpm 安装记录一致，必需的直接依赖清单存在。未检查包内容完整性或构建脚本。')
}
