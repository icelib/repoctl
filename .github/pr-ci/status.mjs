export function validationStatus(client, sha, state, description, targetUrl) {
  return client.createStatus(sha, {
    state,
    context: 'PR Validation',
    description,
    target_url: targetUrl,
  })
}

export async function reportValidation(client, { number, headSha, baseSha, runCi, runDevcontainer, results, targetUrl }) {
  const status = await client.getStatus(headSha)
  const latest = status.statuses.find(item => item.context === 'PR Validation')
  if (latest?.target_url !== targetUrl) {
    return { success: false, description: 'A newer approval run owns this PR validation; leaving its result unchanged.' }
  }
  const pr = await client.getPullRequest(number)
  const base = await client.getRef(`heads/${pr.base.ref}`)
  const current = pr.state === 'open' && !pr.draft && pr.head.sha === headSha && base.object.sha === baseSha
  const success = current
    && results.releaseIntent === 'success'
    && results.ci === (runCi ? 'success' : 'skipped')
    && results.devcontainer === (runDevcontainer ? 'success' : 'skipped')
  const description = !current
    ? 'PR or base changed; approve a new validation run.'
    : success ? 'All applicable PR checks passed.' : 'PR validation failed, was cancelled, or did not complete.'
  await validationStatus(client, headSha, success ? 'success' : 'failure', description, targetUrl)
  return { success, description }
}
