import type { ReleaseOptions } from '../types'
import { realpath } from 'node:fs/promises'
import path from 'pathe'
import { getWorkspacePackages } from '../../../core/workspace'
import { parseLedger, readLedger } from '../intents'
import { capture } from '../shared'

/** Dependency propagation can change manifests without adding ledger entries. */
export async function readSourceCandidates(options: ReleaseOptions, source: string) {
  const ledger = await readLedger(options.cwd)
  const previous = capture('git', ['ls-tree', `${source}^`, '--', '.changeset/ledger.yaml'], options)
    ? parseLedger(capture('git', ['show', `${source}^:.changeset/ledger.yaml`], options))
    : {}
  const root = await realpath(options.cwd)
  const candidates: Array<{ name: string, version: string }> = []
  for (const pkg of await getWorkspacePackages(options.cwd)) {
    const { name, version } = pkg.manifest
    if (!name || !version) {
      continue
    }
    const file = path.relative(root, pkg.pkgJsonPath)
    const before = capture('git', ['ls-tree', `${source}^`, '--', file], options)
      ? JSON.parse(capture('git', ['show', `${source}^:${file}`], options)) as { name?: string, version?: string }
      : undefined
    const key = `${name}@${version}`
    if (before?.name !== name || before.version !== version || (ledger[key] && !previous[key])) {
      candidates.push({ name, version })
    }
  }
  return candidates
}
