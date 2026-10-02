import type { ProjectReferencesConfig } from '../../types'
import { record } from '../deps/files'
import { relativeFile } from './files'

export function parseSettings(value: unknown): ProjectReferencesConfig {
  if (value === undefined) {
    return {}
  }
  const config = record(value)
  if (!config || Object.keys(config).some(key => !['enabled', 'root', 'projects', 'exclude', 'relations'].includes(key))) {
    throw new Error('Invalid tooling.projectReferences configuration.')
  }
  if (config['enabled'] !== undefined && typeof config['enabled'] !== 'boolean') {
    throw new Error('projectReferences.enabled must be a boolean.')
  }
  if (config['root'] !== undefined) {
    relativeFile(config['root'])
  }
  for (const field of ['projects', 'exclude'] as const) {
    if (config[field] !== undefined && (!Array.isArray(config[field]) || config[field].some(item => !relativeFile(item, true)))) {
      throw new Error(`projectReferences.${field} must contain relative config patterns.`)
    }
  }
  if (config['relations'] !== undefined) {
    if (!Array.isArray(config['relations'])) {
      throw new TypeError('projectReferences.relations must be an array.')
    }
    for (const value of config['relations']) {
      const edge = record(value)
      if (!edge || Object.keys(edge).some(key => !['source', 'target'].includes(key))) {
        throw new Error('Invalid projectReferences relation.')
      }
      relativeFile(edge['source'])
      relativeFile(edge['target'])
    }
  }
  return config as ProjectReferencesConfig
}

export function validateLayers(layers: unknown[]) {
  for (const layer of layers) {
    const tooling = record(record(layer)?.['tooling'])
    if (tooling && Object.hasOwn(tooling, 'projectReferences')) {
      parseSettings(tooling['projectReferences'])
    }
  }
}
