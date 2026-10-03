import type { TemplateSnapshot } from '@icebreakers/monorepo-templates'
import fs from 'node:fs/promises'
import { safeInstancePath } from '@icebreakers/monorepo-templates'

/** Inspect only template-owned candidates; unrelated and explicitly unmanaged business data is not a template snapshot. */
export async function captureUpgradeTarget(root: string, paths: string[], excluded: string[] = []): Promise<TemplateSnapshot> {
  if (!(await fs.stat(root)).isDirectory()) {
    throw new Error('A template upgrade target must be an existing directory.')
  }
  const snapshot: TemplateSnapshot = { schemaVersion: 1, files: [], directories: [] }
  const candidates = new Set(paths)
  for (const filename of paths) {
    let parent = filename
    while (parent.includes('/')) {
      parent = parent.slice(0, parent.lastIndexOf('/'))
      candidates.add(parent)
    }
  }
  let bytes = 0
  for (const relative of [...candidates].sort()) {
    if (excluded.some(prefix => relative === prefix || relative.startsWith(`${prefix}/`))) {
      continue
    }
    try {
      const filename = await safeInstancePath(root, relative)
      const stat = await fs.lstat(filename)
      if (stat.isDirectory()) {
        snapshot.directories.push(relative)
      }
      else if (stat.isFile()) {
        bytes += stat.size
        if (bytes > 32 * 1024 * 1024) {
          throw new Error('Template-managed upgrade candidates exceed the supported snapshot size. Exclude business-owned paths explicitly.')
        }
        snapshot.files.push({ path: relative, content: (await fs.readFile(filename)).toString('base64'), executable: (stat.mode & 0o111) !== 0 })
      }
      else {
        throw new Error(`Unsupported template upgrade file: ${relative}`)
      }
    }
    catch (error) {
      if (!['ENOENT', 'ENOTDIR'].includes((error as NodeJS.ErrnoException).code ?? '')) {
        throw error
      }
    }
  }
  return snapshot
}
