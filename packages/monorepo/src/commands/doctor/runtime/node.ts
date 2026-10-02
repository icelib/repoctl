import type { DoctorCheck, DoctorContext } from '../types'
import process from 'node:process'
import { intersects, satisfies, validRange } from 'semver'
import { localize } from '../../../i18n'
import fs from '../../../utils/fs'

export function checkNodeVersion({ packageJson }: DoctorContext): DoctorCheck {
  const range = packageJson.engines?.node
  const known = typeof range === 'string' && !!validRange(range)
  const status = known ? (satisfies(process.version, range) ? 'pass' : 'fail') : 'warn'
  return {
    id: 'node-version',
    title: localize('Node version', 'Node 版本'),
    status,
    detail: known
      ? localize(`Node ${process.version} ${status === 'pass' ? 'satisfies' : 'does not satisfy'} ${range}.`, `当前 Node ${process.version} ${status === 'pass' ? '满足' : '不满足'} ${range}。`)
      : localize('engines.node is missing or is not a supported semver range; compatibility is unknown.', 'engines.node 缺失或不是可识别的 semver 范围，兼容性未知。'),
    ...(status !== 'pass' ? { fix: localize('Declare engines.node and switch to a Node version it allows.', '声明 engines.node，并切换到允许的 Node 版本。') } : {}),
  }
}

export async function checkNodeVersionFiles({ workspaceDir, packageJson }: DoctorContext): Promise<DoctorCheck> {
  const versions: { file: string, value: string, range: string }[] = []
  const unknown: string[] = []
  const conflicts: string[] = []
  for (const file of ['.nvmrc', '.node-version']) {
    if (!await fs.pathExists(`${workspaceDir}/${file}`)) {
      continue
    }
    try {
      const value = (await fs.readFile(`${workspaceDir}/${file}`, 'utf8')).replace(/#.*$/gm, '').trim()
      const range = /^v?\d+(?:\.\d+){0,2}(?:-[\w.-]+)?$/.test(value) ? validRange(value) : null
      if (!range) {
        unknown.push(`${file}=${value || '(empty)'}`)
        continue
      }
      versions.push({ file, value, range })
      if (!satisfies(process.version, range)) {
        conflicts.push(`${file}=${value} / Node ${process.version}`)
      }
      const engines = packageJson.engines?.node
      if (engines && validRange(engines) && !intersects(range, engines)) {
        conflicts.push(`${file}=${value} / engines.node=${engines}`)
      }
    }
    catch {
      unknown.push(`${file} (unreadable)`)
    }
  }
  if (versions.length === 2 && !intersects(versions[0]!.range, versions[1]!.range)) {
    conflicts.push('.nvmrc / .node-version')
  }
  const status = conflicts.length ? 'fail' : unknown.length ? 'warn' : 'pass'
  return {
    id: 'node-version-files',
    title: localize('Node version files', 'Node 版本文件'),
    status,
    detail: conflicts.length
      ? localize(`Conflicting Node versions: ${conflicts.join('; ')}.`, `Node 版本冲突：${conflicts.join('；')}。`)
      : unknown.length
        ? localize(`Version is unknown without resolving aliases online: ${unknown.join('; ')}.`, `无法离线解析版本或别名：${unknown.join('；')}。`)
        : localize('Existing numeric Node version files agree with this runtime and engines.node (when declared); missing files are optional.', '现有数字版本文件与当前 Node 及已声明的 engines.node 一致；版本文件可选。'),
    ...(status !== 'pass' ? { fix: localize('Align .nvmrc, .node-version and engines.node using numeric versions, then switch Node.', '使用数字版本统一 .nvmrc、.node-version 和 engines.node，然后切换 Node。') } : {}),
  }
}
