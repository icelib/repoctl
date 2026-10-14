export async function requestReleaseValidation(client, { receipt, usesEventToken, baseBranch, defaultBranch, headSha, headRef }) {
  // App/PAT events already trigger pull_request_target. Only the suppressed token needs dispatch.
  if (!usesEventToken || receipt.action !== 'prepare' || !receipt.done.includes('prepare') || headRef === baseBranch) {
    return false
  }
  // Release preparation owns the branch name. Match its actual output instead of duplicating its naming rules.
  const prs = await client.listReleasePullRequests(baseBranch, headRef)
  const pr = prs.find(candidate => candidate.state === 'open'
    && !candidate.draft
    && candidate.base.ref === baseBranch
    && candidate.head.ref === headRef
    && candidate.head.repo.full_name === client.repository
    && candidate.head.sha === headSha)
  if (!pr) {
    throw new Error('Prepared Release PR not found at the expected commit; no validation requested.')
  }
  await client.dispatchPrValidation(pr.number, defaultBranch)
  return pr.number
}
