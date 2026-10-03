import type { TemplateValidationOptions, TemplateValidationPlan } from './types'
import { lstat, readFile, realpath } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { assetsDir, ensureTemplateAssetsPrepared } from '@icebreakers/monorepo-templates'
import { createTemplateCatalog } from '../../core/template-catalog'
import { loadTemplateCatalogContext } from '../../core/template-catalog/config'
import { resolveRemoteTemplateSource } from '../../core/template-source'
import { templateFiles } from './files'
import { prepareValidationParameters } from './parameters'

export async function prepareTemplateValidationPlan(options: TemplateValidationOptions, download = false): Promise<TemplateValidationPlan> {
  const cwd = path.resolve(options.cwd ?? process.cwd())
  const context = await loadTemplateCatalogContext({ cwd })
  const catalog = createTemplateCatalog(context)
  const entry = catalog.entries.find(candidate => candidate.key === options.template)
  const invalid = catalog.diagnostics.find(item => item.status === 'fail' && (!item.template || item.template === options.template))
  if (invalid || !entry) {
    throw new Error(invalid?.detail ?? `Unknown template: ${options.template}`)
  }
  const cacheDir = options.cacheDir ?? context.createConfig.cacheDir
  const sourceResolution = entry.remote ? await resolveRemoteTemplateSource(entry.remote, entry.source, { cwd, offline: !download || (options.offline ?? context.createConfig.offline ?? false), ...(cacheDir ? { cacheDir } : {}) }) : undefined
  const sourceDir = sourceResolution?.sourceDir ?? entry.sourceDir
  const names = options.names ?? ['validation-sample']
  if (!names.length || names.length > 20 || new Set(names).size !== names.length || names.some(name => !/^[a-z][a-z0-9-]{0,63}$/u.test(name))) {
    throw new Error('Provide 1–20 distinct sample names containing lowercase letters, digits and hyphens.')
  }
  if (options.timeoutMs !== undefined && (!Number.isFinite(options.timeoutMs) || options.timeoutMs <= 0)) {
    throw new Error('timeoutMs must be positive.')
  }
  if (options.keep !== undefined && !['never', 'failure', 'always'].includes(options.keep)) {
    throw new Error('keep must be never, failure or always.')
  }
  if (!options.fixtureDir) {
    await ensureTemplateAssetsPrepared()
  }
  const fixtureDir = await realpath(path.resolve(cwd, options.fixtureDir ?? assetsDir))
  const root = JSON.parse(await readFile(path.join(fixtureDir, 'package.json'), 'utf8'))
  const packageManager = root.packageManager
  if (typeof packageManager !== 'string' || !/^pnpm@\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/u.test(packageManager)) {
    throw new Error('The workspace fixture must declare an exact pnpm packageManager version.')
  }
  const files = await templateFiles(sourceDir)
  for (const file of [...files, ...await templateFiles(fixtureDir)]) {
    if ((await lstat(file)).isSymbolicLink()) {
      throw new Error(`Template validation inputs must not contain symlinks: ${file}`)
    }
  }
  const prepared = await prepareValidationParameters(sourceDir, entry.category ?? null, names, options.parameterSets)
  const diagnostics = prepared.sets.flatMap(set => set.diagnostics)
  if (!entry.category) {
    diagnostics.push({ code: 'MISSING_TEMPLATE_CATEGORY', file: 'repoctl.config', message: 'Declare a template category so validation can select the correct artifact checks.' })
  }
  const requiredScripts = new Set(prepared.sets.flatMap(set => set.scripts))
  const scripts = ['build', 'lint', 'lint:styles', 'typecheck', 'tsd', 'test', 'test:e2e'].filter(script => requiredScripts.has(script))
  return { schemaVersion: 1, template: entry.key, sourceDir: await realpath(sourceDir), ...(sourceResolution ? { sourceResolution } : {}), category: entry.category ?? null, fixtureDir, packageManager, names, parameterSets: prepared.sets, scripts, diagnostics }
}

export function planTemplateValidation(options: TemplateValidationOptions) {
  return prepareTemplateValidationPlan(options)
}
