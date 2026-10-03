import type { CapabilitySettings } from './playwright/files'
import type { ToolingCapabilityPlan } from './types'
import * as JSONC from 'comment-json'
import micromatch from 'micromatch'
import YAML from 'yaml'
import { readOptional } from '../../core/file-transaction/paths'

export async function rootFiles(settings: CapabilitySettings, conflicts: ToolingCapabilityPlan['conflicts']) {
  const { root, workspace } = settings
  const files: Record<string, string> = {}
  const conflict = (file: string, detail: string) => conflicts.push({ id: 'existing-configuration', path: file, detail })
  const rawPackage = await readOptional(root, 'package.json')
  const rawWorkspace = await readOptional(root, 'pnpm-workspace.yaml')
  if (!rawPackage || !rawWorkspace) {
    throw new Error('Tooling capabilities require package.json and pnpm-workspace.yaml at the workspace root')
  }
  const pkg = JSONC.parse(rawPackage.toString()) as Record<string, any>
  const scripts = pkg['scripts'] ??= {}
  if (scripts['test:e2e'] && scripts['test:e2e'] !== 'turbo run test:e2e') {
    conflict('package.json', 'Existing test:e2e script differs from the requested Turbo entrypoint')
  }
  else {
    scripts['test:e2e'] = 'turbo run test:e2e'
  }
  if (!pkg['devDependencies']?.turbo && !pkg['dependencies']?.turbo) {
    conflict('package.json', 'The workspace must already install Turbo before adding this capability')
  }
  files['package.json'] = `${JSONC.stringify(pkg, null, 2)}\n`
  const doc = YAML.parseDocument(rawWorkspace.toString())
  if (doc.errors.length) {
    throw new Error(`Invalid pnpm workspace configuration: ${doc.errors[0]?.message}`)
  }
  const patterns = doc.toJS()?.packages
  if (!Array.isArray(patterns) || !patterns.every(item => typeof item === 'string')) {
    throw new Error('pnpm workspace packages must be an array of patterns')
  }
  if (patterns.some(item => item.startsWith('!') && micromatch.isMatch(workspace.directory, item.slice(1), { dot: true }))) {
    conflict('pnpm-workspace.yaml', 'The E2E directory is explicitly excluded by existing workspace patterns')
  }
  else if (!micromatch.isMatch(workspace.directory, patterns.filter(item => !item.startsWith('!')), { dot: true })) {
    doc.addIn(['packages'], workspace.directory)
  }
  files['pnpm-workspace.yaml'] = doc.toString()
  const rawTurbo = await readOptional(root, 'turbo.json')
  const turbo = rawTurbo ? JSONC.parse(rawTurbo.toString()) as Record<string, any> : { $schema: 'https://turborepo.com/schema.json', tasks: {} }
  if (turbo['pipeline']) {
    conflict('turbo.json', 'Legacy Turbo pipeline configuration needs migration before adding E2E')
  }
  const tasks = turbo['tasks'] ??= {}
  const desired = { dependsOn: ['^build'], cache: false, outputs: ['playwright-report/**', 'test-results/**'] }
  if (tasks['test:e2e'] && JSON.stringify(tasks['test:e2e']) !== JSON.stringify(desired)) {
    conflict('turbo.json', 'Existing test:e2e task differs; merge it explicitly before applying')
  }
  else {
    tasks['test:e2e'] = desired
  }
  files['turbo.json'] = `${JSONC.stringify(turbo, null, 2)}\n`
  return files
}
