import { lstat, readFile } from 'node:fs/promises'
import path from 'pathe'
import YAML from 'yaml'
import { hash, record } from '../../deps/files'

export const knipConfigNames = ['knip.json', 'knip.jsonc', '.knip.json', '.knip.jsonc', 'knip.ts', 'knip.js', 'knip.config.ts', 'knip.config.js']

/** Track primary native configuration without treating source/dependency fixes as policy changes. */
export async function knipConfigurationInputs(root: string, explicit: string | null) {
  const packageJson = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'))
  const inputs = new Map<string, string>([['package.json#knip', hash(JSON.stringify(packageJson.knip ?? null))]])
  const candidates = new Set(explicit ? [explicit] : [])
  if (!explicit) {
    let directory = root
    while (true) {
      for (const name of knipConfigNames) {
        candidates.add(path.join(directory, name))
      }
      const parent = path.dirname(directory)
      if (parent === directory) {
        break
      }
      directory = parent
    }
  }
  for (const file of candidates) {
    try {
      if (!(await lstat(file)).isDirectory()) {
        inputs.set(path.relative(root, file), hash(await readFile(file, 'utf8')))
      }
    }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error
      }
    }
  }
  try {
    const workspace = record(YAML.parse(await readFile(path.join(root, 'pnpm-workspace.yaml'), 'utf8')))
    inputs.set('pnpm-workspace.yaml#packages', hash(JSON.stringify(workspace?.['packages'] ?? null)))
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error
    }
  }
  return {
    rootName: typeof packageJson.name === 'string' ? packageJson.name : null,
    configuration: [...inputs].sort(([a], [b]) => a.localeCompare(b)).map(([file, digest]) => ({ path: file, hash: digest })),
  }
}
