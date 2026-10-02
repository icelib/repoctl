import type { TemplateFileDifference, TemplateSnapshot } from './types'
import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { shouldSkipTemplatePath } from '../utils/template-filter'
import { portableRelativePath } from './paths'

const ignoredDirectories = new Set(['.git', '.repoctl'])
const maxSnapshotBytes = 32 * 1024 * 1024

export function snapshotDigest(snapshot: TemplateSnapshot) {
  return createHash('sha256').update(JSON.stringify(snapshot)).digest('hex')
}

export function validateSnapshot(value: unknown): asserts value is TemplateSnapshot {
  const snapshot = value as TemplateSnapshot
  if (snapshot?.schemaVersion !== 1 || !Array.isArray(snapshot.files) || !Array.isArray(snapshot.directories)) {
    throw new Error('Invalid template baseline snapshot.')
  }
  const seen = new Set<string>()
  let previous = ''
  for (const directory of snapshot.directories) {
    portableRelativePath(directory)
    if (seen.has(directory) || directory < previous) {
      throw new Error('Invalid or non-canonical template baseline directories.')
    }
    seen.add(directory)
    previous = directory
  }
  previous = ''
  for (const file of snapshot.files) {
    portableRelativePath(file.path)
    if (typeof file.content !== 'string' || typeof file.executable !== 'boolean' || Buffer.from(file.content, 'base64').toString('base64') !== file.content
      || seen.has(file.path) || file.path < previous) {
      throw new Error('Invalid or non-canonical template baseline files.')
    }
    seen.add(file.path)
    previous = file.path
  }
}

/** Capture only template deliverables; never follow symbolic links or collect repository credentials. */
export async function captureTemplateSnapshot(directory: string): Promise<TemplateSnapshot> {
  const rootStat = await fs.lstat(directory)
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) {
    throw new Error(`Template source must be a real directory: ${directory}`)
  }
  const snapshot: TemplateSnapshot = { schemaVersion: 1, files: [], directories: [] }
  let bytes = 0
  const visit = async (current: string) => {
    for (const entry of await fs.readdir(current, { withFileTypes: true })) {
      const file = path.join(current, entry.name)
      if (ignoredDirectories.has(entry.name) || shouldSkipTemplatePath(directory, file)) {
        continue
      }
      if (entry.isSymbolicLink() || (!entry.isDirectory() && !entry.isFile())) {
        throw new Error(`Unsupported link or special file in template: ${path.relative(directory, file)}`)
      }
      if (entry.isDirectory()) {
        snapshot.directories.push(portableRelativePath(path.relative(directory, file).split(path.sep).join('/')))
        if (snapshot.directories.length >= 10_000) {
          throw new Error('Template baseline exceeds the supported directory count.')
        }
        await visit(file)
      }
      else {
        const content = await fs.readFile(file)
        bytes += content.byteLength
        if (bytes > maxSnapshotBytes || snapshot.files.length >= 10_000) {
          throw new Error('Template baseline exceeds the supported snapshot size.')
        }
        const relative = path.relative(directory, file).split(path.sep).join('/')
        snapshot.files.push({ path: portableRelativePath(relative), content: content.toString('base64'), executable: ((await fs.stat(file)).mode & 0o111) !== 0 })
      }
    }
  }
  await visit(directory)
  snapshot.files.sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0)
  snapshot.directories.sort()
  return snapshot
}

export function compareTemplateSnapshots(baseline: TemplateSnapshot, current: TemplateSnapshot): TemplateFileDifference[] {
  const entries = (snapshot: TemplateSnapshot) => new Map([
    ...snapshot.files.map(file => [file.path, JSON.stringify([file.content, file.executable])] as const),
    ...snapshot.directories.map(directory => [directory, 'directory'] as const),
  ])
  const before = entries(baseline)
  const after = entries(current)
  return [...new Set([...before.keys(), ...after.keys()])].sort().flatMap((file) => {
    if (before.get(file) === after.get(file)) {
      return []
    }
    return [{ path: file, status: !before.has(file) ? 'added' as const : !after.has(file) ? 'deleted' as const : 'modified' as const }]
  })
}

export async function writeTemplateSnapshot(snapshot: TemplateSnapshot, targetDir: string) {
  validateSnapshot(snapshot)
  // A new isolated directory is mandatory; reconstructing never overwrites an existing project.
  await fs.mkdir(targetDir)
  try {
    for (const directory of snapshot.directories) {
      await fs.mkdir(path.join(targetDir, ...directory.split('/')), { recursive: true })
    }
    for (const file of snapshot.files) {
      const target = path.join(targetDir, ...file.path.split('/'))
      await fs.mkdir(path.dirname(target), { recursive: true })
      await fs.writeFile(target, Buffer.from(file.content, 'base64'), { flag: 'wx', mode: file.executable ? 0o755 : 0o644 })
    }
  }
  catch (error) {
    await fs.rm(targetDir, { recursive: true, force: true })
    throw error
  }
}
