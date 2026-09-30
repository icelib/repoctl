import type { PublishedPackage } from '../types'
import { createHash } from 'node:crypto'
import { packageKey } from '../publish/state'

export function releaseStateKey(repository: string, distTag: string, candidates: PublishedPackage[]) {
  return createHash('sha256').update(JSON.stringify({ repository, distTag, packages: candidates.map(packageKey).sort() })).digest('hex')
}
