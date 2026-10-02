import type { DoctorManifest } from './types'
import { readFile, realpath } from 'node:fs/promises'
import path from 'node:path'
import JSON5 from 'json5'
import { glob } from 'tinyglobby'
import YAML from 'yaml'
import { record } from './types'

export async function discoverDoctorManifests(workspaceDir: string, patterns: string[]): Promise<DoctorManifest[]> {
  // Match pnpm's manifest glob rules, but parse each file independently so one
  // broken package does not discard all other diagnostic evidence.
  const files = await glob(patterns.map(pattern => pattern.replace(/\/?$/, '/package.{json,yaml,json5}')), {
    cwd: workspaceDir,
    expandDirectories: false,
    ignore: ['**/node_modules/**', '**/bower_components/**'],
  })
  const root = await glob('package.{json,yaml,json5}', { cwd: workspaceDir, expandDirectories: false })
  const grouped = new Map<string, string[]>()
  for (const file of [...new Set([...root, ...files])].sort()) {
    const declared = path.dirname(path.resolve(workspaceDir, file))
    const directory = await realpath(declared).catch(() => declared)
    const entries = grouped.get(directory) ?? []
    if (!entries.some(existing => path.basename(existing) === path.basename(file))) {
      entries.push(file)
    }
    grouped.set(directory, entries)
  }
  const manifests: DoctorManifest[] = []
  for (const [directory, candidates] of grouped) {
    const filename = candidates.find(file => file.endsWith('.json')) ?? candidates[0]!
    const entry: DoctorManifest = { directory, path: path.relative(workspaceDir, path.join(directory, path.basename(filename))).replaceAll('\\', '/') }
    try {
      const text = (await readFile(path.join(workspaceDir, filename), 'utf8')).replace(/^\uFEFF/, '')
      const value: unknown = filename.endsWith('.yaml') ? YAML.parse(text) : filename.endsWith('.json5') ? JSON5.parse(text) : JSON.parse(text)
      const data = record(value)
      if (!data) {
        entry.error = 'invalid_structure'
      }
      else {
        entry.data = data
        if (candidates.length > 1) {
          entry.error = 'multiple_manifests'
        }
      }
    }
    catch {
      // Parser messages can include manifest values such as authenticated URLs.
      entry.error = 'unreadable'
    }
    manifests.push(entry)
  }
  return manifests.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0)
}
