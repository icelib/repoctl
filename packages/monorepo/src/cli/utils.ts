import type { InitToolingTarget } from '../commands/init/tooling/types'
import type { CleanCommandConfig, CliOpts } from '../types'
import { initToolingTargets } from '../commands/init/tooling/types'
import { localize } from '../i18n'

export interface CleanCommandOptions {
  yes?: boolean
  dryRun?: boolean
  includePrivate?: boolean
  pinnedVersion?: string
}

export interface InitCommandOptions {
  all?: boolean
  force?: boolean
}

export function normalizeCliOpts(cwd: string, opts: CliOpts): CliOpts {
  return {
    ...opts,
    core: opts.core ?? false,
    cwd,
  }
}

export function normalizeCleanOptions(opts: CleanCommandOptions) {
  const overrides: Partial<CleanCommandConfig> = {}
  if (opts.dryRun) {
    overrides.dryRun = true
  }
  if (opts.yes) {
    overrides.autoConfirm = true
  }
  if (opts.includePrivate) {
    overrides.includePrivate = true
  }
  if (opts.pinnedVersion) {
    overrides.pinnedVersion = opts.pinnedVersion
  }
  return overrides
}

export function normalizeToolingTargets(tooling: string[]) {
  if (!tooling.length) {
    return undefined
  }

  const unknown = tooling.filter(item => !initToolingTargets.includes(item as InitToolingTarget))
  if (unknown.length > 0) {
    throw new Error(localize(`Unknown init tooling target: ${unknown.join(', ')}`, `未知的 init tooling 目标: ${unknown.join(', ')}`))
  }
  return tooling as InitToolingTarget[]
}

export type NormalizedToolingTargets = InitToolingTarget[] | undefined
