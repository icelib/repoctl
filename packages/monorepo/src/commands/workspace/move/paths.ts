import type { WorkspaceGraphNode } from '../../../core/workspace-graph/types'
import { lstat, mkdir, readdir, rename, rmdir } from 'node:fs/promises'
import process from 'node:process'
import path from 'pathe'
import { assertSafePath, isWithin } from '../../clean/safety'

export function movedPath(file: string, from: string, to: string) {
  return file === from ? to : file.startsWith(`${from}/`) ? to + file.slice(from.length) : file
}

export async function exists(file: string) {
  return lstat(file).then(() => true, (error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') {
      return false
    }
    throw error
  })
}

export function validPackageName(name: string) {
  return name.length > 0 && name.length <= 214 && name === name.toLowerCase()
    && /^(?:@[a-z\d][a-z\d._~-]*\/)?[a-z\d][a-z\d._~-]*$/u.test(name)
    && !['node_modules', 'favicon.ico'].includes(name)
}

export async function validateDestination(root: string, from: string, value: string, nodes: WorkspaceGraphNode[]) {
  if (!value || path.isAbsolute(value) || value.includes('\\') || value.includes('\0')
    || value.split('/').some(part => part === '..' || (part.startsWith('.') && part !== '.') || ['node_modules', 'vendor'].includes(part))) {
    throw new Error('The destination must be a normal relative directory inside the workspace.')
  }
  const target = path.resolve(root, value)
  const relative = path.relative(root, target)
  if (!isWithin(root, target) || isWithin(path.join(root, from), target)
    || nodes.some(node => node.id !== '.' && node.id !== from && (node.id === relative || isWithin(path.join(root, node.id), target) || isWithin(target, path.join(root, node.id))))) {
    throw new Error('The destination overlaps the root, the selected package or another workspace.')
  }
  if (relative !== from && await exists(target)) {
    throw new Error(`Destination already exists: ${relative}`)
  }
  let current = root
  for (const component of relative.split('/').slice(0, -1)) {
    current = path.join(current, component)
    if (await exists(current)) {
      await assertSafePath(root, current, 'directory')
    }
  }
  return relative
}

/** Reserve the leaf exclusively so rename cannot replace an unrelated empty directory. */
export async function prepareDestination(root: string, relative: string) {
  const created: Array<{ path: string, ino: bigint, dev: bigint }> = []
  const cleanup = async () => {
    const retained: string[] = []
    for (const item of [...created].reverse()) {
      try {
        if (!await exists(item.path)) {
          continue
        }
        await assertSafePath(root, item.path, 'directory')
        const metadata = await lstat(item.path, { bigint: true })
        if (metadata.ino !== item.ino || metadata.dev !== item.dev) {
          throw new Error('Concurrent directory replacement')
        }
        await rmdir(item.path)
      }
      catch {
        retained.push(item.path)
      }
    }
    return retained
  }
  let current = root
  try {
    for (const component of relative.split('/')) {
      current = path.join(current, component)
      const leaf = current === path.join(root, relative)
      if (leaf || !await exists(current)) {
        await mkdir(current)
        const metadata = await lstat(current, { bigint: true })
        created.push({ path: current, ino: metadata.ino, dev: metadata.dev })
      }
      await assertSafePath(root, current, 'directory')
    }
  }
  catch (error) {
    const retained = await cleanup()
    if (retained.length) {
      throw new AggregateError([error], `Destination preparation failed; inspect retained directories: ${retained.join(', ')}`)
    }
    throw error
  }
  return {
    cleanup,
    async move(source: string) {
      const leaf = created.at(-1)!
      await assertSafePath(root, source, 'directory')
      await assertSafePath(root, leaf.path, 'directory')
      const metadata = await lstat(leaf.path, { bigint: true })
      if (metadata.ino !== leaf.ino || metadata.dev !== leaf.dev || (await readdir(leaf.path)).length) {
        throw new Error('The reserved destination changed before moving.')
      }
      // Windows rename refuses an existing directory instead of replacing it.
      if (process.platform === 'win32') {
        await rmdir(leaf.path)
      }
      await rename(source, leaf.path)
      created.pop()
    },
  }
}
