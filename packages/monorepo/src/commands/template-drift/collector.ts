import type { TemplateDriftCollection, TemplateDriftOptions } from './types'
import { realpath } from 'node:fs/promises'
import path from 'pathe'
import { collectInstanceDrift } from './instances'
import { collectRootAssetDrift } from './root-assets'
import { collectVersionEvidence } from './versions'

/** This layer never loads config, writes assets, renders templates or executes package scripts. */
export async function collectTemplateDrift(workspaceDir: string, options: TemplateDriftOptions = {}): Promise<TemplateDriftCollection> {
  if (!options || typeof options !== 'object' || Array.isArray(options)
    || (options.remote !== undefined && typeof options.remote !== 'boolean')
    || (options.sourceDir !== undefined && (typeof options.sourceDir !== 'string' || !options.sourceDir.trim()))
    || (options.remote && options.sourceDir)) {
    throw new Error('Template drift options require either an extracted source directory or explicit remote lookup, not both.')
  }
  workspaceDir = path.normalize(await realpath(workspaceDir))
  const evidence = await collectVersionEvidence(options)
  const instances = await collectInstanceDrift(workspaceDir, evidence)
  const roots = await collectRootAssetDrift(workspaceDir, evidence)
  return { schemaVersion: 1, workspaceDir, evidence, instanceRegistry: instances.registry, rootRegistry: roots.registry, owners: [...instances.owners, ...roots.owners] }
}
