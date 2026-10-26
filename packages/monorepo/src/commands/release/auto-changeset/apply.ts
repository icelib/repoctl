import type { AutoChangesetApplyOptions, AutoChangesetReport } from './types'
import { Buffer } from 'node:buffer'
import { verifyApproval } from './approval'
import { record, sha } from './github/client'
import { assertRevision, readRevision } from './github/revision'
import { planAutoChangeset } from './plan'
import { readPolicy } from './policy'

const mutation = `mutation CreateAutoChangesetCommit($input: CreateCommitOnBranchInput!) {
  createCommitOnBranch(input: $input) { commit { oid } }
}`

/** Recompute the approved proposal, then atomically append one commit to exactly the frozen head. */
export async function applyAutoChangeset(options: AutoChangesetApplyOptions): Promise<AutoChangesetReport> {
  if (!options.expected) {
    throw new Error('Applying an automatic changeset requires a frozen expected revision.')
  }
  const { report, client } = await planAutoChangeset(options, options.expected)
  if (!report.change) {
    return report
  }
  await verifyApproval(client, report.revision, options)
  async function recheck() {
    const revision = await readRevision(client, options)
    const policy = await readPolicy(client, revision, options)
    assertRevision({ ...revision, policyDigest: policy.policyDigest }, report.revision)
  }
  await recheck()
  const change = report.change
  const result = await client.graphql(mutation, {
    input: {
      branch: { repositoryNameWithOwner: report.revision.repository, branchName: report.revision.headRef },
      expectedHeadOid: report.revision.headSha,
      message: { headline: `chore: ${change.action === 'delete' ? 'remove' : 'update'} automatic changeset for #${report.revision.pullRequest}` },
      fileChanges: change.action === 'delete'
        ? { deletions: [{ path: change.path }] }
        : { additions: [{ path: change.path, contents: Buffer.from(change.content!).toString('base64') }] },
    },
  })
  const commitSha = sha(record(record(result['createCommitOnBranch'])['commit'])['oid'])
  return { ...report, status: 'applied', commitSha }
}
