import type { DocsSiteConfig } from '../../types/docs'
import { readFile } from 'node:fs/promises'
import path from 'pathe'
import { parse } from 'yaml'
import { getWorkspacePackages } from '../../core/workspace'
import { record } from '../deps/files'
import { dependencyReferences } from '../package-check/dependencies'
import { resolveCatalog } from './catalog'

/** Resolve product runtime relationships from the frozen checkout, including aliases. */
export async function coveredPackages(source: string, site: DocsSiteConfig) {
  const workspace = await getWorkspacePackages(source, { ignorePrivatePackage: false })
  const configuration = record(parse(await readFile(path.join(source, 'pnpm-workspace.yaml'), 'utf8')))
  if (!configuration) {
    throw new Error('Cannot read documentation workspace dependency configuration')
  }
  const byName = new Map<string, typeof workspace[number]>()
  const byDirectory = new Map(workspace.map(pkg => [path.resolve(pkg.rootDir), pkg]))
  for (const pkg of workspace) {
    const name = pkg.manifest.name
    if (!name) {
      continue
    }
    if (byName.has(name)) {
      throw new Error(`Duplicate documentation workspace package name: ${name}`)
    }
    byName.set(name, pkg)
  }
  const visited = new Set<string>()
  const queue = [...site.packages]
  while (queue.length) {
    const name = queue.shift()!
    if (visited.has(name)) {
      continue
    }
    const pkg = byName.get(name)
    if (!pkg || pkg.manifest.private) {
      throw new Error(`Documented product package must be a publishable workspace package: ${name}`)
    }
    visited.add(name)
    for (const field of ['dependencies', 'optionalDependencies', 'peerDependencies'] as const) {
      for (const [alias, specifier] of Object.entries(pkg.manifest[field] ?? {})) {
        const effective = resolveCatalog(alias, specifier, configuration)
        const reference = dependencyReferences({ dependencies: { [alias]: effective } }, pkg.rootDir)[0]!
        const dependency = reference.directory ? byDirectory.get(path.resolve(reference.directory)) : byName.get(reference.name)
        if (dependency?.manifest.name) {
          queue.push(dependency.manifest.name)
        }
        else if (reference.protocol !== 'registry') {
          throw new Error(`Unresolved local documentation runtime dependency: ${name} -> ${alias} (${effective})`)
        }
      }
    }
  }
  return [...visited].sort().map(name => byName.get(name)!)
}
