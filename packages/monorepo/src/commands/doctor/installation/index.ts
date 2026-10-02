import type { DoctorCheck, DoctorContext } from '../types'
import { isDeepStrictEqual } from 'node:util'
import path from 'pathe'
import { localize } from '../../../i18n'
import fs from '../../../utils/fs'
import { compareManifest, readLockfile, readYaml, record } from './lockfile'
import { checkInstallation } from './state'

export async function collectInstallationChecks(context: DoctorContext): Promise<DoctorCheck[]> {
  const { workspaceDir, packageJson } = context
  const manifests = context.manifests.filter(entry => entry.data).map(entry => ({
    dir: path.relative(workspaceDir, entry.directory) || '.',
    manifest: entry.data!,
  }))
  const lockfilePath = path.join(workspaceDir, 'pnpm-lock.yaml')
  const lockfile = await readLockfile(lockfilePath)
  const workspace = (await readYaml(path.join(workspaceDir, 'pnpm-workspace.yaml')))?.[0] ?? {}
  const mismatches: string[] = []
  const unknown = context.manifests.filter(entry => entry.error).map(entry => `${entry.path} (invalid manifest)`)
  for (const entry of context.manifests) {
    for (const section of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']) {
      if (entry.data?.[section] !== undefined && !record(entry.data[section])) {
        unknown.push(`${entry.path}: ${section} (invalid structure)`)
      }
    }
  }
  if (context.workspaceManifestError || !context.manifests.some(entry => entry.directory === workspaceDir && entry.data)) {
    unknown.push('workspace or root package manifest is unreadable')
  }
  if (lockfile) {
    const overrides = record(workspace['overrides']) ?? record(record(packageJson)?.['pnpm'])?.['overrides'] ?? {}
    if (!isDeepStrictEqual(overrides, lockfile['overrides'] ?? {})) {
      unknown.push('workspace overrides differ from lockfile overrides')
    }
    for (const { dir, manifest } of manifests) {
      const importer = record(record(lockfile['importers'])?.[dir])
      if (!importer) {
        mismatches.push(`${dir} (missing importer)`)
        continue
      }
      const compared = compareManifest(manifest, importer, workspace, lockfile)
      mismatches.push(...compared.mismatches.map(name => `${dir}: ${name}`))
      unknown.push(...compared.unknown.map(name => `${dir}: ${name}`))
    }
  }
  const hasHooks = await fs.pathExists(path.join(workspaceDir, '.pnpmfile.cjs'))
    || await fs.pathExists(path.join(workspaceDir, '.pnpmfile.mjs'))
    || !!workspace['pnpmfile'] || !!workspace['configDependencies']
  if (hasHooks) {
    unknown.push('pnpmfile/config dependency transformations', ...mismatches.splice(0))
  }
  const status = mismatches.length ? 'fail' : !lockfile || unknown.length ? 'warn' : 'pass'
  const lockCheck: DoctorCheck = {
    id: 'lockfile-sync',
    title: localize('Manifest and lockfile consistency', '清单与锁文件一致性'),
    status,
    detail: !lockfile
      ? await fs.pathExists(lockfilePath)
        ? localize('Lockfile state is unknown: malformed or unsupported format (supported: pnpm lockfile v9).', '锁文件状态未知：格式损坏或不受支持（支持 pnpm v9 锁文件）。')
        : localize('pnpm-lock.yaml is missing; dependency resolution has not been recorded.', '缺少 pnpm-lock.yaml，尚无依赖解析记录。')
      : mismatches.length
        ? localize(`Manifest/lockfile mismatch: ${mismatches.join('; ')}.`, `清单与锁文件不匹配：${mismatches.join('；')}。`)
        : unknown.length
          ? localize(`Cannot prove consistency for transformed or unsupported specifiers: ${unknown.join('; ')}.`, `无法确认经过转换或不受支持的依赖声明：${unknown.join('；')}。`)
          : localize(`Dependency specifiers match the lockfile for ${manifests.length} workspace manifest(s).`, `${manifests.length} 个 workspace 清单的依赖声明与锁文件一致。`),
    ...(status !== 'pass'
      ? { fix: status === 'warn'
          ? localize('Review the evidence limit and validate with the declared pnpm version. Regenerate the lockfile only when dependency state needs updating; unsupported transformations remain unknown.', '检查证据限制并使用声明的 pnpm 版本手动验证。仅在依赖状态需要更新时重新生成锁文件；不支持的转换仍会显示未知。')
          : localize('Review manifest changes and pnpm configuration, then explicitly run pnpm install with the declared version to regenerate the lockfile.', '检查清单变更和 pnpm 配置，然后手动使用声明版本运行 pnpm install 更新锁文件。') }
      : {}),
  }
  return [lockCheck, await checkInstallation(context, lockfile, lockCheck, manifests)]
}
