import type { AffectedFallback, AffectedFile } from './types'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { parse } from 'comment-json'

export const defaultAffectedGlobalInputs = [
  'package.json',
  'pnpm-workspace.yaml',
  'pnpm-lock.yaml',
  'turbo.json',
  'turbo.jsonc',
  'tsconfig*.json',
  'eslint.config.*',
  '.eslintrc*',
  'stylelint.config.*',
  '.stylelintrc*',
  'vitest.config.*',
  'lint-staged.config.*',
  'commitlint.config.*',
  '.npmrc',
  '.pnpmfile.*',
  '.node-version',
  '.nvmrc',
  '.github/**',
  '.husky/**',
  'scripts/**',
  'patches/**',
]

export function readAffectedGlobalInputs(cwd: string, extra: string[] = []) {
  const patterns = new Set([...defaultAffectedGlobalInputs, ...extra])
  const fallback: AffectedFallback[] = []
  const config = ['turbo.json', 'turbo.jsonc'].map(file => path.join(cwd, file)).find(file => existsSync(file))
  if (config) {
    try {
      const data = parse(readFileSync(config, 'utf8')) as { globalDependencies?: unknown }
      if (data.globalDependencies !== undefined) {
        if (!Array.isArray(data.globalDependencies) || !data.globalDependencies.every(value => typeof value === 'string')) {
          throw new Error('Invalid globalDependencies')
        }
        for (const pattern of data.globalDependencies) {
          patterns.add(pattern)
        }
      }
    }
    catch {
      fallback.push({ code: 'global_inputs_unavailable' })
    }
  }
  return { patterns: [...patterns].sort(), fallback }
}

export function classifyAffectedFiles(files: AffectedFile[], ids: string[], globalInputs: string[]) {
  const owners = [...ids].sort((a, b) => b.length - a.length)
  const fallback: AffectedFallback[] = []
  const triggers = new Map<AffectedFallback['code'], string[]>()
  const trigger = (code: AffectedFallback['code'], file: string) => triggers.set(code, [...(triggers.get(code) ?? []), file])
  for (const file of files) {
    const owner = owners.find(id => file.path.startsWith(`${id}/`))
    if (owner) {
      file.owner = owner
    }
    if (globalInputs.some(pattern => path.matchesGlob(file.path, pattern))) {
      file.reason = 'global_input'
      trigger('global_input', file.path)
    }
    else if (path.basename(file.path) === 'package.json') {
      file.reason = 'workspace_manifest'
      trigger('workspace_manifest_changed', file.path)
    }
    else if (!owner) {
      const documentation = file.path.startsWith('docs/') || (!file.path.includes('/') && /\.(?:md|mdx)$/i.test(file.path)) || /^(?:LICENSE|LICENCE|NOTICE)(?:\.|$)/i.test(file.path)
      file.reason = documentation ? 'documentation' : 'unowned'
      if (!documentation) {
        trigger('unowned_change', file.path)
      }
    }
  }
  for (const [code, files] of triggers) {
    fallback.push({ code, files })
  }
  return fallback
}
