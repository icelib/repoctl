export async function requestReleaseValidation(client, { receipt, usesEventToken, baseBranch, defaultBranch, headSha, headRef }) {
  // App/PAT events already trigger pull_request_target. Only the suppressed token needs dispatch.
  if (!usesEventToken || receipt.action !== 'prepare' || !receipt.done.includes('prepare') || headRef !== `pnpm-release/${baseBranch}`) {
    return false
  }
  const prs = await client.listReleasePullRequests(baseBranch)
  const pr = prs.find(candidate => candidate.state === 'open'
    && !candidate.draft
    && candidate.base.ref === baseBranch
    && candidate.head.ref === `pnpm-release/${baseBranch}`
    && candidate.head.repo.full_name === client.repository
    && candidate.head.sha === headSha)
  if (!pr) {
    throw new Error('Prepared Release PR not found at the expected commit; no validation requested.')
  }
  await client.dispatchPrValidation(pr.number, defaultBranch)
  return pr.number
}
