export const docsTargets = {
  preview: { url: 'https://next.repo.icebreaker.top', worker: 'repoctl-docs-next', environment: 'next' },
  stable: { url: 'https://repo.icebreaker.top', worker: 'repoctl-docs', environment: '' },
}

export function resolveChannel(value = 'preview') {
  const channel = value || 'preview'
  if (!Object.hasOwn(docsTargets, channel)) {
    throw new Error(`Unknown documentation channel: ${channel}`)
  }
  return channel
}

export function buildIdentity(env, fallbackSha = '') {
  const identity = {
    channel: resolveChannel(env.REPO_DOCS_CHANNEL),
    sourceSha: env.REPO_DOCS_SOURCE_SHA || fallbackSha,
    releaseId: env.REPO_DOCS_RELEASE_ID || '',
    deploymentId: env.REPO_DOCS_DEPLOYMENT_ID || '',
  }
  if (identity.channel === 'stable') {
    assertDeploymentContext(env, 'stable')
  }
  return identity
}

export function assertDeploymentContext(env, channel) {
  if (env.REPO_DOCS_SITE !== 'website' || env.REPO_DOCS_CHANNEL !== channel
    || !/^[a-f\d]{40}$/u.test(env.REPO_DOCS_SOURCE_SHA ?? '')
    || !/^[a-f\d]{64}$/u.test(env.REPO_DOCS_DEPLOYMENT_ID ?? '')
    || !env.REPO_DOCS_RESULT_FILE || env.REPO_DOCS_URL !== docsTargets[channel]?.url) {
    throw new Error('Direct website deployment is disabled. Use repo docs deploy website with a verified source and channel.')
  }
  if (channel === 'stable' && (!env.REPO_DOCS_RELEASE_ID || env.GITHUB_ACTIONS !== 'true'
    || !env.GITHUB_RUN_ID || env.REPO_DOCS_CONCURRENCY_GROUP !== 'docs-website-stable')) {
    throw new Error('Stable documentation requires a completed release and the managed docs-website-stable workflow.')
  }
}

export function assertBuildIdentity(actual, expected) {
  if (!actual || typeof actual !== 'object'
    || Object.entries(expected).some(([key, value]) => actual[key] !== value)) {
    throw new Error('Documentation artifact does not match this deployment; rebuild the selected snapshot.')
  }
}

export const deploymentMessage = identity => `repoctl-docs:${identity.deploymentId}`
