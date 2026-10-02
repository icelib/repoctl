import { createHash } from 'node:crypto'
import { lstat, readFile, realpath } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'pathe'

export const presetManifestName = 'repoctl.preset.json'
export const hashPresetFile = (content: Uint8Array) => createHash('sha256').update(content).digest('hex')

/** Portable relative paths; preset declarations cannot escape their package or target root. */
export function presetRelativePath(value: string) {
  if (!value || value !== value.trim() || value.includes('\\') || /[:*?"<>|]/u.test(value) || Array.from(value).some(character => character.charCodeAt(0) < 32)
    || path.isAbsolute(value) || value.split('/').some(part => !part || part === '.' || part === '..' || /[. ]$/u.test(part) || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/iu.test(part))) {
    throw new Error('Preset paths must be portable relative file paths without parent traversal.')
  }
  return value
}

/** Package roots may be pnpm links; symlinks inside the package are never followed. */
export async function readPresetFile(root: string, relative: string) {
  const parts = presetRelativePath(relative).split('/')
  let filename = root
  for (const [index, part] of parts.entries()) {
    filename = path.join(filename, part)
    const info = await lstat(filename)
    if (info.isSymbolicLink() || (index === parts.length - 1 ? !info.isFile() : !info.isDirectory())) {
      throw new Error(`Preset input is not an ordinary file path: ${relative}`)
    }
    if (index === parts.length - 1 && info.size > 1024 * 1024) {
      throw new Error(`Preset input exceeds 1 MiB: ${relative}`)
    }
  }
  if (path.normalize(await realpath(filename)) !== filename) {
    throw new Error(`Preset input path changed: ${relative}`)
  }
  const content = await readFile(filename)
  if (content.length > 1024 * 1024) {
    throw new Error(`Preset input exceeds 1 MiB: ${relative}`)
  }
  return { filename, content, hash: hashPresetFile(content) }
}

export function parsePresetJson(content: Uint8Array, name: string): unknown {
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(content))
  }
  catch {
    // JSON parse errors can include the original contents, including credentials.
    throw new Error(`Preset input must be UTF-8 JSON: ${name}`)
  }
}

/** Resolve data paths only. Package exports and JavaScript entrypoints are never loaded. */
export async function installedPresetDirectory(packageName: string, fromDirectory: string) {
  const require = createRequire(path.join(fromDirectory, '__repoctl_preset__.cjs'))
  const localPaths = new Set<string>()
  let parent = path.resolve(fromDirectory)
  while (true) {
    localPaths.add(path.join(parent, 'node_modules'))
    const next = path.dirname(parent)
    if (next === parent) {
      break
    }
    parent = next
  }
  for (const directory of require.resolve.paths(packageName) ?? []) {
    // A missing declared dependency must not silently resolve from NODE_PATH or a global install.
    if (!localPaths.has(path.normalize(directory))) {
      continue
    }
    const candidate = path.join(directory, packageName)
    try {
      const root = path.normalize(await realpath(candidate))
      if ((await lstat(root)).isDirectory()) {
        return root
      }
    }
    catch (error) {
      if (!['ENOENT', 'ENOTDIR'].includes((error as NodeJS.ErrnoException).code ?? '')) {
        throw error
      }
    }
  }
  return null
}
