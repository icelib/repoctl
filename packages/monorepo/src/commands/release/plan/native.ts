import type { ReleasePlanOptions } from './types'
import process from 'node:process'
import crossSpawn from 'cross-spawn'
import { valid } from 'semver'

export class PlanError extends Error {
  constructor(readonly id: string, message: string) {
    super(message)
  }
}

export function capturePlan(args: string[], options: ReleasePlanOptions) {
  // Even `pnpm --version` records packageManagerDependencies in pnpm 12.
  // Disable launcher/config side effects for every probe, not only version's dry-run.
  const readonlyArgs = [
    '--config.pm-on-fail=ignore',
    '--config.runtime-on-fail=ignore',
    '--config.manage-package-manager-versions=false',
    '--config.ignore-pnpmfile=true',
    '--config.ignore-scripts=true',
    ...args,
  ]
  const result = (options.spawn ?? crossSpawn.sync)('pnpm', readonlyArgs, {
    cwd: options.cwd,
    env: {
      ...(options.env ?? process.env),
      NO_COLOR: '1',
      FORCE_COLOR: '0',
      COREPACK_ENABLE_AUTO_PIN: '0',
      COREPACK_ENABLE_NETWORK: '0',
    },
    encoding: 'utf8',
    shell: false,
    timeout: 60000,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  if (result.error || result.status !== 0) {
    throw new PlanError('pnpm-plan-failed', `pnpm ${args.join(' ')} failed: ${result.error?.message ?? result.stderr?.toString().trim() ?? result.status}`)
  }
  return result.stdout?.toString().trim() ?? ''
}

interface NativeRelease {
  name: string
  currentVersion: string
  newVersion: string
  bump: string
  reasons: string[]
}

function unsupported(): never {
  throw new PlanError('unsupported-pnpm-plan', 'Unsupported pnpm release-plan output. Use a pnpm version with recursive --dry-run support (tested with 12.8.1); no versions were applied.')
}

/** Interpret native results only; pnpm remains the sole version solver. */
export function parseNativePlan(output: string): { format: 'json' | 'text', packages: NativeRelease[] } {
  let json: unknown
  try {
    json = JSON.parse(output)
  }
  catch { /* pnpm 12.8.1 prints a textual nonempty plan even with --json. */ }
  if (Array.isArray(json)) {
    const packages = json.map((item) => {
      if (!item || typeof item.name !== 'string' || typeof item.currentVersion !== 'string'
        || typeof item.newVersion !== 'string' || !valid(item.currentVersion) || !valid(item.newVersion)) {
        return unsupported()
      }
      return {
        name: item.name,
        currentVersion: item.currentVersion,
        newVersion: item.newVersion,
        bump: typeof item.bump === 'string' ? item.bump : 'unknown',
        reasons: Array.isArray(item.reasons) && item.reasons.every((reason: unknown) => typeof reason === 'string') ? item.reasons : [],
      } as NativeRelease
    })
    return { format: 'json', packages }
  }
  const lines = output.split(/\r?\n/).filter(line => line.trim())
  if (lines.shift() !== 'Release plan:' || !lines.length) {
    return unsupported()
  }
  const packages = lines.map((line) => {
    const match = /^ {2}(.+): (\S+) → (\S+) \(([^,]+), via ([^)]+)\)$/.exec(line)
    if (!match || !valid(match[2]) || !valid(match[3])) {
      return unsupported()
    }
    return { name: match[1]!, currentVersion: match[2]!, newVersion: match[3]!, bump: match[4]!, reasons: match[5]!.split('+').sort() }
  })
  return { format: 'text', packages }
}

export function nativePlan(options: ReleasePlanOptions) {
  const version = capturePlan(['--version'], options)
  if (!valid(version)) {
    return unsupported()
  }
  const help = capturePlan(['version', '--help'], options)
  if (!help.includes('--dry-run') || !help.includes('--json')) {
    return unsupported()
  }
  const output = capturePlan(['version', '-r', '--dry-run', '--json', '--no-git-checks'], options)
  const plan = parseNativePlan(output)
  // JSON implementations can omit explanation; status supplies native reasons when available.
  if (plan.format === 'json' && plan.packages.length) {
    const status = capturePlan(['change', 'status'], options)
    const start = status.indexOf('Release plan:')
    if (start !== -1) {
      const explanations = parseNativePlan(status.slice(start))
      for (const pkg of plan.packages) {
        const explained = explanations.packages.find(item => item.name === pkg.name && item.newVersion === pkg.newVersion && item.currentVersion === pkg.currentVersion)
        if (explained) {
          pkg.bump = explained.bump
          pkg.reasons = explained.reasons
        }
      }
    }
  }
  return { ...plan, version }
}
