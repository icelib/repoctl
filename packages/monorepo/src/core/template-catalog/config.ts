import type { ResolveTemplateCatalogOptions, TemplateCatalogContext } from './types'
import { existsSync } from 'node:fs'
import process from 'node:process'
import { findWorkspaceDir } from '@pnpm/find-workspace-dir'
import path from 'pathe'
import { templatesDir as defaultTemplatesDir } from '../../constants'
import { getRepoctlConfigCandidates, loadMonorepoConfigDetails } from '../config'
import { ConfigValidationError } from '../config/validation'

export async function loadTemplateCatalogContext(options: ResolveTemplateCatalogOptions = {}): Promise<TemplateCatalogContext> {
  const cwd = path.resolve(options.cwd ?? process.cwd())
  const workspaceDir = await findWorkspaceDir(cwd) ?? cwd
  let configDirectory = cwd
  let loaded: Awaited<ReturnType<typeof loadMonorepoConfigDetails>>
  try {
    loaded = await loadMonorepoConfigDetails(configDirectory)
    if (!loaded.file && workspaceDir !== cwd) {
      configDirectory = workspaceDir
      loaded = await loadMonorepoConfigDetails(configDirectory)
    }
  }
  catch (error) {
    if (!(error instanceof ConfigValidationError)) {
      throw error
    }
    const configFile = getRepoctlConfigCandidates(configDirectory).find(existsSync) ?? null
    return {
      workspaceDir,
      configFile,
      templatesDir: options.templatesDir ? path.resolve(cwd, options.templatesDir) : defaultTemplatesDir,
      createConfig: {},
      diagnostics: error.diagnostics.map(diagnostic => ({
        id: diagnostic.id,
        status: 'fail',
        configFile,
        configPath: diagnostic.path,
        detail: diagnostic.suggestion,
        configDiagnostic: diagnostic,
      })),
    }
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
    presetLayers: loaded.presets.layers,
    rawCreateConfigs: loaded.rawLayers.map(layer => layer.commands?.create).filter(layer => layer !== undefined),
  }
}
