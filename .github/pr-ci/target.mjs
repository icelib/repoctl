export function releaseLabels(pr) {
  return [...new Set((pr.labels ?? []).map(label => typeof label === 'string' ? label : label.name).filter(name => name === 'release:major' || name === 'release:minor'))].sort()
}

export function openPullRequest(pr, repository) {
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

export async function currentTarget(client, { number, headSha, baseSha, baseRef, headRef, headRepository, releaseLabels: labels }) {
  const pr = await client.getPullRequest(number)
  const base = await client.getRef(`heads/${baseRef}`)
  const repository = headRepository ?? pr.head.repo.full_name
  const head = await client.getRef(`heads/${headRef ?? pr.head.ref}`, repository)
  const current = pr.state === 'open' && !pr.draft && pr.mergeable !== false
    && pr.base.repo.full_name === client.repository
    && pr.head.sha === headSha && head.object.sha === headSha
    && pr.base.sha === baseSha && base.object.sha === baseSha && pr.base.ref === baseRef
    && (!headRef || pr.head.ref === headRef)
    && pr.head.repo.full_name === repository
    && (!labels || JSON.stringify(releaseLabels(pr)) === JSON.stringify([...labels].sort()))
  return { pr, current }
}
