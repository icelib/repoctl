import { createHash } from 'node:crypto'
import { lstat, readFile, realpath } from 'node:fs/promises'
import path from 'pathe'
import { localize } from '../../i18n'

export function hash(content: string) {
  return createHash('sha256').update(content).digest('hex')
}

export function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined
}

/** Retain lexical paths so a symlink cannot hide an out-of-workspace manifest. */
export async function safeFile(root: string, relative: string) {
  const target = path.resolve(root, relative)
  const resolved = path.relative(root, target)
  if (!resolved || resolved === '..' || resolved.startsWith('../') || path.isAbsolute(resolved)) {
    throw new Error(localize(`Unsafe dependency input: ${relative}`, `依赖输入路径不安全：${relative}`))
  }
  let current = root
  for (const component of resolved.split('/')) {
    current = path.join(current, component)
    const entry = await lstat(current)
    if (entry.isSymbolicLink() || (current === target ? !entry.isFile() || entry.nlink > 1 : !entry.isDirectory())) {
      throw new Error(localize(`Linked or unsupported dependency input: ${relative}`, `依赖输入是链接或不支持的文件：${relative}`))
    }
  }
  if (path.resolve(await realpath(target)) !== target) {
    throw new Error(localize(`Dependency input changed: ${relative}`, `依赖输入发生变化：${relative}`))
  }
  return target
}

export async function readInput(root: string, relative: string) {
  return readFile(await safeFile(root, relative), 'utf8')
}

export function updateManifest(original: string, section: string, dependency: string, target: string) {
  const manifest = JSON.parse(original)
  manifest[section][dependency] = target
  const indentation = original.match(/\n([\t ]+)"/)?.[1] ?? '  '
  const newline = original.includes('\r\n') ? '\r\n' : '\n'
  return `${JSON.stringify(manifest, null, indentation).replaceAll('\n', newline)}${original.endsWith('\n') ? newline : ''}`
}
