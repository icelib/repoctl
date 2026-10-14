import { setTimeout } from 'node:timers/promises'
import { processPullRequest } from '../auto-changeset/index.mjs'
import { validationPaths } from './paths.mjs'
import { validationStatus } from './status.mjs'

function openPullRequest(pr, repository) {
  if (pr.state !== 'open' || pr.draft || pr.base.repo.full_name !== repository) {
    throw new Error('Validation requires an open, ready PR in this repository.')
  }
  if (!/^[0-9a-f]{40}$/.test(pr.head.sha) || !/^[0-9a-f]{40}$/.test(pr.base.sha)) {
    throw new Error('GitHub returned an invalid PR commit SHA.')
  }
  if (pr.mergeable === false) {
    throw new Error('Resolve PR merge conflicts before approving validation.')
  }
}

async function frozenMerge(client, number, headSha, baseSha, wait) {
  // The test merge ref can lag behind a changeset push. Verify its parents, not just its name.
  for (let attempt = 0; attempt < 12; attempt++) {
    const pr = await client.getPullRequest(number)
    openPullRequest(pr, client.repository)
    const base = await client.getRef(`heads/${pr.base.ref}`)
    if (pr.head.sha !== headSha || base.object.sha !== baseSha) {
      throw new Error('PR or base changed during preparation; approve the latest run.')
    }
    if (pr.mergeable === true && /^[0-9a-f]{40}$/.test(pr.merge_commit_sha ?? '')) {
      const commit = await client.getCommit(pr.merge_commit_sha)
      if (commit.parents?.length === 2 && commit.parents[0].sha === baseSha && commit.parents[1].sha === headSha) {
        return { pr, mergeSha: pr.merge_commit_sha }
      }
    }
    if (attempt < 11) {
      await wait(5000)
    }
  }
  throw new Error('GitHub did not provide a current PR merge commit; retry validation.')
}

export async function prepareValidation(client, { number, expectedHeadSha, targetUrl, wait = milliseconds => setTimeout(milliseconds), processIntent = processPullRequest }) {
  const initial = await client.getPullRequest(number)
  openPullRequest(initial, client.repository)
  if (expectedHeadSha && initial.head.sha !== expectedHeadSha) {
    throw new Error('PR head changed while awaiting approval; approve the latest run.')
  }
  let headSha = initial.head.sha
  try {
    const base = await client.getRef(`heads/${initial.base.ref}`)
    const intent = await processIntent(client, number, { expectedHeadSha: headSha })
    if (intent.action === 'commented') {
      throw new Error('Fork PRs must include their own release intent. Add one with pnpm change.')
    }
    headSha = intent.sha ?? headSha
    const { pr, mergeSha } = await frozenMerge(client, number, headSha, base.object.sha, wait)
    const comparison = await client.compareCommits(base.object.sha, headSha)
    // Compare responses are pinned to both SHAs but list at most 300 files.
    const files = comparison.files ?? []
    const paths = validationPaths(files, files.length >= 300 ? Infinity : files.length)
    await validationStatus(client, headSha, 'pending', 'Approved; validating the final PR merge commit.', targetUrl)
    return {
      pr_number: number,
      head_sha: headSha,
      base_sha: base.object.sha,
      merge_sha: mergeSha,
      head_ref: pr.head.ref,
      ...paths,
    }
  }
  catch (error) {
    await validationStatus(client, headSha, 'failure', 'PR preparation failed; see the approved workflow run.', targetUrl)
    throw error
  }
}
