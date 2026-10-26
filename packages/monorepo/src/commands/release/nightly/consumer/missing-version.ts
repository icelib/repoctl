import type { NightlyReport } from '../types'
import { ConsumerCommandError } from './run'

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function dependencyContext(stack: unknown): string | undefined {
  if (!Array.isArray(stack) || !stack.length) {
    return undefined
  }
  const lines: string[] = []
  for (const parent of stack as unknown[]) {
    if (!isRecord(parent) || typeof parent['name'] !== 'string' || !parent['name'] || typeof parent['version'] !== 'string' || !parent['version']
      || /\p{Cc}/u.test(parent['name']) || /\p{Cc}/u.test(parent['version'])) {
      return undefined
    }
    lines.push(`\nThis error happened while installing the dependencies of ${parent['name']}@${parent['version']}`)
  }
  return lines.join('')
}

function missingVersionTarget(message: string, stack: unknown): string | undefined {
  // pnpm 12 formats each structured parent as a context line after the resolver error.
  const context = dependencyContext(stack)
  const resolverMessage = context && message.endsWith(context) ? message.slice(0, -context.length) : message
  const reference = /^No matching version found for (\S+) while fetching it from https:\/\/registry\.npmjs\.org\/(?:\n\nFailed to resolve \1)?\s*$/u.exec(resolverMessage)?.[1]
  // pnpm includes the dependency alias before its actual registry target.
  return reference?.replace(/^(?:@[^/@\s]+\/)?[^/@\s]+@npm:/u, '')
}

/** Retry only named registry versions; unrelated resolution or authentication errors fail immediately. */
export function missingRegistryVersion(error: unknown, expected: ReadonlySet<string>): boolean {
  if (!(error instanceof ConsumerCommandError) || error.command.exitCode === null) {
    return false
  }
  let missing = false
  for (const line of `${error.command.stdout}\n${error.command.stderr}`.split('\n').filter(line => line.trim())) {
    let record: unknown
    try {
      record = JSON.parse(line)
    }
    catch {
      return false
    }
    if (!isRecord(record)) {
      return false
    }
    if (record['level'] !== 'error') {
      continue
    }
    const nested = isRecord(record['err']) ? record['err'] : undefined
    if (record['err'] !== undefined && !nested) {
      return false
    }
    const code = record['code'] ?? nested?.['code']
    const message = record['message'] ?? nested?.['message']
    if (code !== 'ERR_PNPM_NO_MATCHING_VERSION' || (nested?.['code'] !== undefined && nested['code'] !== code) || typeof message !== 'string'
      || record['cause'] !== undefined || nested?.['cause'] !== undefined || (nested?.['message'] !== undefined && nested['message'] !== message)) {
      return false
    }
    const target = missingVersionTarget(message, record['pkgsStack'])
    if (!target || !expected.has(target)) {
      return false
    }
    missing = true
  }
  return missing
}

/** A confirmed upload can precede visibility in pnpm's installation packument. */
export function missingBatchVersion(error: unknown, report: NightlyReport): boolean {
  return missingRegistryVersion(error, new Set(report.packages.flatMap(pkg => [`${pkg.name}@snapshot-nightly`, `${pkg.name}@${pkg.version}`])))
}
