import type { TemplateValidationOptions, TemplateValidationPlan } from './types'
import { lstat, readFile, realpath } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { assetsDir, ensureTemplateAssetsPrepared } from '@icebreakers/monorepo-templates'
import { resolveTemplateCatalog } from '../../core/template-catalog'
import { templateFiles } from './files'

export async function planTemplateValidation(options: TemplateValidationOptions): Promise<TemplateValidationPlan> {
  const cwd = path.resolve(options.cwd ?? process.cwd())
  const catalog = await resolveTemplateCatalog({ cwd })
  const entry = catalog.entries.find(candidate => candidate.key === options.template)
  const invalid = catalog.diagnostics.find(item => item.status === 'fail' && (!item.template || item.template === options.template))
  if (invalid || !entry) {
    throw new Error(invalid?.detail ?? `Unknown template: ${options.template}`)
  }
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
  const manifest = JSON.parse(await readFile(path.join(entry.sourceDir, 'package.json'), 'utf8'))
  const root = JSON.parse(await readFile(path.join(fixtureDir, 'package.json'), 'utf8'))
  const packageManager = root.packageManager
  if (typeof packageManager !== 'string' || !/^pnpm@\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/u.test(packageManager)) {
    throw new Error('The workspace fixture must declare an exact pnpm packageManager version.')
  }
  const files = await templateFiles(entry.sourceDir)
  for (const file of [...files, ...await templateFiles(fixtureDir)]) {
    if ((await lstat(file)).isSymbolicLink()) {
      throw new Error(`Template validation inputs must not contain symlinks: ${file}`)
    }
  }
  const typed = files.some(file => /\.(?:[cm]?tsx?|vue)$/u.test(file))
  const styles = files.some(file => /\.(?:css|scss|less|sass|vue)$/u.test(file))
  const styleScript = styles && !/\bstylelint\b/u.test(manifest.scripts?.lint ?? '') ? ['lint:styles'] : []
  const scripts = ['build', 'lint', ...styleScript, ...(typed ? ['typecheck'] : []), ...(entry.category === 'library' && typed ? ['tsd'] : []), 'test']
  if (typeof manifest.scripts?.['test:e2e'] === 'string') {
    scripts.push('test:e2e')
  }
  const diagnostics = scripts.filter(script => typeof manifest.scripts?.[script] !== 'string' || !manifest.scripts[script].trim()).map(script => ({
    code: 'MISSING_REQUIRED_SCRIPT',
    file: 'package.json',
    message: `Missing required script: ${script}`,
  }))
  if (!entry.category) {
    diagnostics.push({ code: 'MISSING_TEMPLATE_CATEGORY', file: 'repoctl.config', message: 'Declare a template category so validation can select the correct artifact checks.' })
  }
  return { schemaVersion: 1, template: entry.key, sourceDir: await realpath(entry.sourceDir), category: entry.category ?? null, fixtureDir, packageManager, names, scripts, diagnostics }
}
