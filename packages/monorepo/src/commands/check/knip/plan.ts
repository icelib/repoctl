import type { KnipCheckOptions, KnipCheckPlan } from '../../../types/knip'
import { readFile, realpath, stat } from 'node:fs/promises'
import process from 'node:process'
import { findWorkspaceDir } from '@pnpm/find-workspace-dir'
import path from 'pathe'
import semver from 'semver'
import { packageDir } from '../../../constants'
import { record } from '../../deps/files'

export const supportedKnip = '>=6.39.0 <7' as const

export async function knipRoot(cwd: string) {
  return path.resolve(await realpath(await findWorkspaceDir(cwd) ?? cwd))
}

export async function planKnipCheck(cwd: string, options: KnipCheckOptions = {}): Promise<KnipCheckPlan> {
  if ([options.newOnly, options.production, options.strict].some(value => value !== undefined && typeof value !== 'boolean')) {
    throw new Error('Knip newOnly, production and strict must be boolean options.')
  }
  if (options.newOnly && !options.baseline) {
    throw new Error('Knip new-only mode requires an explicit baseline file.')
  }
  for (const value of [options.config, options.baseline]) {
    if (value !== undefined && (typeof value !== 'string' || !value.trim())) {
      throw new Error('Knip config and baseline paths must be non-empty strings.')
    }
  }
  const timeoutMs = options.timeoutMs ?? 120_000
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
    throw new Error('Knip timeoutMs must be a positive integer.')
  }
  const root = await knipRoot(cwd)
  const toolDirectory = path.join(root, 'node_modules/knip')
  let version: string | null = null
  let entry: string | null = null
  let status: KnipCheckPlan['status'] = 'missing_tool'
  try {
    const manifest = JSON.parse(await readFile(path.join(toolDirectory, 'package.json'), 'utf8'))
    version = typeof manifest.version === 'string' ? manifest.version : null
    const bin = typeof manifest.bin === 'string' ? manifest.bin : record(manifest.bin)?.['knip']
    const target = typeof bin === 'string' ? path.resolve(toolDirectory, bin) : ''
    const relative = path.relative(toolDirectory, target)
    if (manifest.name !== 'knip' || !version || !semver.satisfies(version, supportedKnip)
      || !relative || relative.startsWith('../') || path.isAbsolute(relative) || !(await stat(target)).isFile()) {
      status = 'unsupported_tool'
    }
    else {
      entry = target
      status = 'ready'
    }
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      status = 'unsupported_tool'
    }
  }
  const config = options.config ? path.resolve(cwd, options.config) : null
  if (config && !(await stat(config)).isFile()) {
    throw new Error('The explicit Knip configuration must be a file.')
  }
  const args = entry ? [entry, '--no-progress', '--reporter', path.join(packageDir, 'resources/knip/reporter.mjs'), ...(config ? ['--config', config] : []), ...(options.production ? ['--production'] : []), ...(options.strict ? ['--strict'] : [])] : []
  return {
    schemaVersion: 1,
    kind: 'knip-check',
    workspaceDir: root,
    status,
    tool: { name: 'knip', version, supported: supportedKnip, entry },
    executable: process.execPath,
    args,
    config,
    baseline: options.baseline ? path.resolve(root, options.baseline) : null,
    newOnly: options.newOnly === true,
    production: options.production === true || options.strict === true,
    strict: options.strict === true,
    timeoutMs,
    guidance: status === 'ready' ? [] : ['Install a supported workspace-local tool explicitly: pnpm add -Dw knip@^6.39.0', 'This check never downloads Knip or falls back to a parent/global installation.'],
  }
}
