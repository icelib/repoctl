import type { Command } from '@icebreakers/monorepo-templates'
import { registerLegacySnapshot } from './legacy'
import { registerPreparedSnapshot } from './prepared'

export { formatSnapshotReport } from './legacy'

export function registerSnapshot(release: Command, cwd: string) {
  const snapshot = release.command('snapshot')
  registerLegacySnapshot(snapshot, cwd)
  registerPreparedSnapshot(snapshot, cwd)
}
