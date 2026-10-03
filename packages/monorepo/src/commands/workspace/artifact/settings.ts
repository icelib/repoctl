import process from 'node:process'
import path from 'pathe'
import { canonicalDirectory } from '../../upgrade/plan/files'
import { inside } from './paths'
import { runNative } from './process'

const pathKeys = ['store-dir', 'cache-dir', 'state-dir', 'modules-dir', 'virtual-store-dir', 'lockfile-dir']
const localKeys = new Set(['modules-dir', 'virtual-store-dir', 'lockfile-dir'])

export async function verifyWritePaths(root: string, isolated: string | undefined, paths: Array<{ name: string, value: string }>) {
  for (const { name, value } of paths) {
    if (localKeys.has(name) && (path.isAbsolute(value) || value.split(/[\\/]/u).includes('..'))) {
      throw new Error(`Native deploy ${name} must stay relative to its artifact directory.`)
    }
    if (!path.isAbsolute(value) && !isolated) {
      continue
    }
    const resolved = await canonicalDirectory(path.isAbsolute(value) ? value : path.resolve(isolated!, value))
    if (inside(root, resolved)) {
      throw new Error(`Native deploy ${name} would write inside the source workspace; choose storage outside it before preparing artifacts.`)
    }
  }
}

/** Query only path settings: a full native config dump could include registry credentials. */
export async function deployWritePaths(root: string, executable: string, prefix: string[]) {
  const values = await Promise.all(pathKeys.map(async (name) => {
    const value = await runNative(executable, [...prefix, 'config', 'get', name], root)
    return { name, value }
  }))
  const paths = values.filter(item => !['', 'undefined', 'null'].includes(item.value))
  for (const name of ['PNPM_HOME', 'HOME', 'USERPROFILE', 'XDG_DATA_HOME', 'XDG_CACHE_HOME', 'XDG_STATE_HOME', 'LOCALAPPDATA', 'APPDATA']) {
    const value = process.env[name]
    if (value) {
      paths.push({ name, value })
    }
  }
  await verifyWritePaths(root, undefined, paths)
  return paths
}
