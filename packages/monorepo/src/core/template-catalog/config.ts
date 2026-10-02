import type { ResolveTemplateCatalogOptions, TemplateCatalogContext } from './types'
import process from 'node:process'
import { findWorkspaceDir } from '@pnpm/find-workspace-dir'
import path from 'pathe'
import { templatesDir as defaultTemplatesDir } from '../../constants'
import { loadMonorepoConfigDetails } from '../config'

export async function loadTemplateCatalogContext(options: ResolveTemplateCatalogOptions = {}): Promise<TemplateCatalogContext> {
  const cwd = path.resolve(options.cwd ?? process.cwd())
  const workspaceDir = await findWorkspaceDir(cwd) ?? cwd
  let loaded = await loadMonorepoConfigDetails(cwd)
  if (!loaded.file && workspaceDir !== cwd) {
    loaded = await loadMonorepoConfigDetails(workspaceDir)
  }
  const createConfig = loaded.config.commands?.create ?? {}
  const configDir = loaded.file ? path.dirname(loaded.file) : workspaceDir
  const configuredRoot = typeof createConfig.templatesDir === 'string' && createConfig.templatesDir.trim()
    ? path.resolve(configDir, createConfig.templatesDir)
    : defaultTemplatesDir
  return {
    workspaceDir,
    configFile: loaded.file,
    templatesDir: options.templatesDir ? path.resolve(cwd, options.templatesDir) : configuredRoot,
    createConfig,
    rawCreateConfigs: loaded.rawLayers.map(layer => layer.commands?.create).filter(layer => layer !== undefined),
  }
}
