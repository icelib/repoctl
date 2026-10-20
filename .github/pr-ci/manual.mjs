import { prepareValidation } from './prepare.mjs'
import { reportValidation, validationStatus } from './status.mjs'
import { releaseLabels } from './target.mjs'

export async function prepareManualValidation(client, options) {
  const initial = await client.getPullRequest(options.number)
  try {
    const outputs = await prepareValidation(client, {
      ...options,
      expectedHeadSha: initial.head.sha,
      expectedBaseSha: initial.base.sha,
      expectedBaseRef: initial.base.ref,
      expectedHeadRef: initial.head.ref,
      expectedHeadRepository: initial.head.repo.full_name,
      expectedReleaseLabels: releaseLabels(initial),
    })
    await validationStatus(client, outputs.head_sha, 'pending', 'Approved; validating the frozen PR merge commit.', options.targetUrl)
    return outputs
  }
  catch (error) {
    await validationStatus(client, initial.head.sha, 'failure', 'PR preparation failed; see the approved manual run.', options.targetUrl)
    throw error
  }
}

export async function reportManualValidation(client, options) {
  const status = await client.getStatus(options.headSha)
  const latest = status.statuses.find(item => item.context === 'Manual PR Validation')
  if (latest?.target_url !== options.targetUrl) {
    return { success: false, description: 'A newer approval run owns this manual PR validation; leaving its result unchanged.' }
  }
  const result = await reportValidation(client, options)
  await validationStatus(client, options.headSha, result.success ? 'success' : 'failure', result.description, options.targetUrl)
  return result
}
