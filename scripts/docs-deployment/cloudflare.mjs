import { deploymentMessage } from './identity.mjs'

export function cloudflareClient(env, request = fetch) {
  const token = env.CLOUDFLARE_API_TOKEN
  const account = env.CLOUDFLARE_ACCOUNT_ID
  if (!token || !/^[a-f\d]{32}$/iu.test(account ?? '')) {
    throw new Error('CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID are required to verify documentation deployments.')
  }
  return async (worker, endpoint, allowMissing = false) => {
    const response = await request(`https://api.cloudflare.com/client/v4/accounts/${account}/workers/scripts/${worker}/${endpoint}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(30_000),
    })
    const payload = await response.json()
    if (allowMissing && response.status === 404 && payload.errors?.some(error => error.code === 10007)) {
      return undefined
    }
    if (!response.ok || !payload.success) {
      throw new Error(`Cloudflare ${endpoint} verification failed (HTTP ${response.status}, codes: ${(payload.errors ?? []).map(error => error.code).join(', ')}).`)
    }
    return payload.result
  }
}

/** Only the active version with all traffic can reconcile an interrupted deployment. */
export async function activeMatchingVersion(client, worker, identity) {
  const result = await client(worker, 'deployments', true)
  if (result === undefined) {
    return undefined
  }
  if (!Array.isArray(result.deployments)) {
    throw new TypeError('Cloudflare returned an invalid deployments response.')
  }
  const deployment = [...result.deployments].sort((a, b) => b.created_on.localeCompare(a.created_on))[0]
  if (!deployment) {
    return undefined
  }
  if (!Array.isArray(deployment.versions) || deployment.versions.length !== 1 || deployment.versions[0].percentage !== 100) {
    throw new Error('Documentation Worker must have exactly one active version receiving 100% of traffic.')
  }
  const versionId = deployment.versions[0].version_id
  if (typeof versionId !== 'string' || !/^[a-f\d-]{36}$/iu.test(versionId)) {
    throw new Error('Cloudflare returned an invalid active version ID.')
  }
  const version = await client(worker, `versions/${versionId}`)
  return version.id === versionId && version.annotations?.['workers/message'] === deploymentMessage(identity)
    ? versionId
    : undefined
}

export function readDeploymentVersion(output, worker, environment) {
  const entries = output.split(/\r?\n/u).filter(line => line.trim()).map(line => JSON.parse(line))
  const deployment = entries.findLast(entry => entry?.type === 'deploy' && entry.worker_name === worker
    && (entry.wrangler_environment ?? '') === environment)
  if (typeof deployment?.version_id !== 'string' || !deployment.version_id.trim()) {
    throw new Error(`Wrangler did not report a deployed version for ${worker}.`)
  }
  return deployment.version_id
}
