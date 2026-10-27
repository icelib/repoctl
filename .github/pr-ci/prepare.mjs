import { setTimeout } from 'node:timers/promises'
import { validationPaths } from './paths.mjs'
import { currentTarget, openPullRequest, releaseLabels } from './target.mjs'

async function frozenPullRequest(client, target) {
  const { pr, current } = await currentTarget(client, target)
  if (!current) {
    throw new Error('PR, base, or release labels changed during preparation; approve the latest run.')
  }
  return pr
}

async function frozenMerge(client, target, expectedMergeSha, wait) {
  for (let attempt = 0; attempt < 12; attempt++) {
    const pr = await frozenPullRequest(client, target)
    const sha = expectedMergeSha ?? pr.merge_commit_sha
    if (pr.mergeable === true && /^[0-9a-f]{40}$/.test(sha ?? '')) {
      const commit = await client.getCommit(sha)
      if (commit.parents?.length === 2 && commit.parents[0].sha === target.baseSha && commit.parents[1].sha === target.headSha) {
        return sha
      }
      if (expectedMergeSha) {
        throw new Error('The approved event merge commit does not match the frozen PR head and base.')
      }
    }
    if (attempt < 11) {
      await wait(5000)
    }
  }
  throw new Error('GitHub did not provide a current PR merge commit; retry validation.')
}

export async function prepareValidation(client, {
  number,
  expectedHeadSha,
  expectedBaseSha,
  expectedBaseRef,
  expectedHeadRef,
  expectedHeadRepository,
  expectedReleaseLabels,
  expectedMergeSha = /** @type {string | undefined} */ (undefined),
  wait = milliseconds => setTimeout(milliseconds),
}) {
  const initial = await client.getPullRequest(number)
  openPullRequest(initial, client.repository)
  const labels = releaseLabels(initial)
  const mismatches = [
    ['head.sha', expectedHeadSha, initial.head.sha],
    ['base.sha', expectedBaseSha, initial.base.sha],
    ['base.ref', expectedBaseRef, initial.base.ref],
    ['head.ref', expectedHeadRef, initial.head.ref],
    ['head.repo.full_name', expectedHeadRepository, initial.head.repo.full_name],
    ['releaseLabels', expectedReleaseLabels && [...expectedReleaseLabels].sort(), labels],
  ].filter(([, expected, current]) => expected && JSON.stringify(expected) !== JSON.stringify(current)).map(([field, expected, current]) => ({ field, expected, current }))
  if (mismatches.length) {
    throw new Error(`PR or base changed while awaiting approval, or release labels changed; approve the latest run. Event snapshot mismatches: ${JSON.stringify(mismatches)}`)
  }
  const target = {
    number,
    headSha: initial.head.sha,
    baseSha: initial.base.sha,
    baseRef: initial.base.ref,
    headRef: initial.head.ref,
    headRepository: initial.head.repo.full_name,
    releaseLabels: labels,
  }
  const mergeSha = await frozenMerge(client, target, expectedMergeSha, wait)
  const comparison = await client.compareCommits(target.baseSha, target.headSha)
  // Compare responses are pinned to both SHAs but list at most 300 files.
  const files = comparison.files ?? []
  const paths = validationPaths(files, files.length >= 300 ? Infinity : files.length)
  await frozenPullRequest(client, target)
  return {
    pr_number: number,
    head_sha: target.headSha,
    base_sha: target.baseSha,
    base_ref: target.baseRef,
    merge_sha: mergeSha,
    head_ref: target.headRef,
    head_repository: target.headRepository,
    release_labels: JSON.stringify(labels),
    ...paths,
  }
}
