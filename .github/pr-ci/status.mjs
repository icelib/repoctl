import { currentTarget } from './target.mjs'

export function validationStatus(client, sha, state, description, targetUrl) {
  return client.createStatus(sha, {
    state,
    context: 'Manual PR Validation',
    description,
    target_url: targetUrl,
  })
}

export async function reportValidation(client, options) {
  const { runCi, runDevcontainer, results } = options
  const { current } = await currentTarget(client, options)
  const success = current
    && results.releaseIntent === 'success'
    && results.ci === (runCi ? 'success' : 'skipped')
    && results.devcontainer === (runDevcontainer ? 'success' : 'skipped')
  const description = !current
    ? 'PR, base, or release labels changed; approve a new validation run.'
    : success ? 'All applicable PR checks passed.' : 'PR validation failed, was cancelled, or did not complete.'
  return { success, description }
}
