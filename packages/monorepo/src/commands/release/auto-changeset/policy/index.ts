import type { AutoChangesetGitHub } from '../github/client'
import type { AutoChangesetOptions, AutoChangesetRevision } from '../types'
import { createHash } from 'node:crypto'
import { safePath } from '../github/client'
import { canonical } from '../github/revision'
import { readBlob, readTree } from '../github/tree'
import { validatePolicy } from './schema'

export const defaultPolicyPath = '.github/repoctl-auto-changeset.json'

export async function readPolicy(client: AutoChangesetGitHub, revision: Omit<AutoChangesetRevision, 'policyDigest'>, options: AutoChangesetOptions) {
  let source: unknown = options.policy
  const policyPath = safePath(options.policyPath ?? defaultPolicyPath)
  if (source === undefined) {
    const tree = await readTree(client, revision.policySha)
    const entry = tree.entries.get(policyPath)
    if (!entry && options.policyPath !== undefined) {
      throw new Error(`Trusted auto changeset policy does not exist: ${policyPath}.`)
    }
    source = entry ? JSON.parse(await readBlob(client, entry)) : {}
  }
  const policy = validatePolicy(source)
  const policyDigest = createHash('sha256').update(canonical({ policy, policyPath, source: options.policy === undefined ? 'default-branch' : 'trusted-api' })).digest('hex')
  return { policy, policyDigest }
}
