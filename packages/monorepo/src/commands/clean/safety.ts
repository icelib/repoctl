import type { CleanWorkspace } from './discovery'
import { lstat, realpath } from 'node:fs/promises'
import path from 'pathe'
import { localize } from '../../i18n'

function unsafe(target: string) {
  return new Error(localize(`Unsafe cleanup target: ${target}`, `清理目标不安全：${target}`))
}

export function isWithin(root: string, target: string) {
  const relative = path.relative(root, target)
  return relative !== '' && relative !== '..' && !relative.startsWith('../') && !path.isAbsolute(relative)
}

export async function assertSafePath(workspaceDir: string, target: string, kind: 'directory' | 'file') {
  if (!isWithin(workspaceDir, target)) {
    throw unsafe(target)
  }
  const components = path.relative(workspaceDir, target).split('/')
  let current = workspaceDir
  for (const component of components) {
    current = path.join(current, component)
    const entry = await lstat(current)
    if (entry.isSymbolicLink()) {
      throw unsafe(current)
    }
    if (current === target ? (kind === 'file' ? !entry.isFile() || entry.nlink > 1 : !entry.isDirectory()) : !entry.isDirectory()) {
      throw unsafe(current)
    }
  }
  if (!isWithin(workspaceDir, await realpath(target))) {
    throw unsafe(target)
  }
}

export async function validateCleanTargets(workspace: CleanWorkspace, selected: string[]) {
  const { workspaceDir, packages } = workspace
  const known = new Set(packages.map(pkg => path.resolve(pkg.rootDir)))
  const targets = new Set(selected.map(target => path.resolve(target)))
  for (const target of targets) {
    if (!known.has(target)) {
      throw unsafe(target)
    }
    await assertSafePath(workspaceDir, target, 'directory')
    // A selected parent must not remove an unselected nested workspace.
    for (const pkg of packages) {
      const packageDir = path.resolve(pkg.rootDir)
      if (isWithin(target, packageDir) && !targets.has(packageDir)) {
        throw new Error(localize(`Cleanup would remove an unselected workspace: ${packageDir}`, `清理会删除未选择的工作区：${packageDir}`))
      }
    }
  }
}
