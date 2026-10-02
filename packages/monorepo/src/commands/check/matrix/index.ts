import type { AffectedCheckMatrix, AffectedCheckMatrixJob, AffectedCheckMatrixOptions } from './types'
import { Buffer } from 'node:buffer'
import { resolveAffectedCheckContext } from '../affected'

export type * from './types'

const githubJobLimit = 256

/** Generate data only; preserve stage ordering, build dependencies and full-fallback semantics. */
export async function resolveAffectedCheckMatrix(options: AffectedCheckMatrixOptions): Promise<AffectedCheckMatrix> {
  if (options.shards !== undefined && (!Number.isInteger(options.shards) || options.shards < 1 || options.shards > githubJobLimit)) {
    throw new Error('Matrix shards must be an integer from 1 to 256.')
  }
  const { plan, createCommands } = await resolveAffectedCheckContext(options)
  const byId = new Map(plan.packages.map(pkg => [pkg.id, pkg]))
  const selected = plan.packages.filter(pkg => pkg.selected).map(pkg => pkg.id).sort()
  const grouping = plan.strategy === 'full' ? 'full' : options.shards === undefined ? 'package' : 'shard'
  const count = Math.min(options.shards ?? selected.length, selected.length)
  const groups: string[][] = Array.from({ length: count }, () => [])
  selected.forEach((id, index) => groups[index % count]!.push(id))
  const candidates: AffectedCheckMatrixJob[] = grouping === 'full'
    ? [{ id: 'full', packages: selected, commands: plan.commands }]
    : groups.map((packages, index) => {
        const ids = new Set(packages)
        return {
          id: `${grouping}-${index + 1}`,
          packages,
          commands: createCommands([...ids].map(id => byId.get(id)!), false, true),
        }
      })
  const include = candidates.filter(job => job.commands.some(command => !command.skipReason))
  if (include.length > githubJobLimit) {
    throw new Error(`Matrix needs ${include.length} jobs; GitHub Actions allows 256. Use --shards 256 (or fewer) to keep every selected package.`)
  }
  const matrix = { include }
  // Leave room for hasWork and output metadata inside GitHub's 1 MB per-job output limit.
  if (Buffer.byteLength(JSON.stringify(matrix), 'utf16le') > 1024 * 1024 - 1024) {
    throw new Error('Matrix exceeds GitHub Actions 1 MB job output limit. Use fewer --shards (for example --shards 1) to reduce repeated dependency builds, or narrow --filter explicitly.')
  }
  return {
    schemaVersion: 1,
    provider: 'github-actions',
    hasWork: include.length > 0,
    grouping,
    summary: {
      selectedPackages: selected.length,
      jobs: include.length,
      skippedPackages: candidates.filter(job => !include.includes(job)).flatMap(job => job.packages).sort(),
    },
    matrix,
    affectedPlan: plan,
  }
}
