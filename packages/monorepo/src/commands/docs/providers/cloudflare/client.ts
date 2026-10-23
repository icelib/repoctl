import type { DocsCloudflareWorkersTarget } from '../../../../types/docs'
import { Buffer } from 'node:buffer'
import { isRecord } from '../../../../core/config/validation/schema'
import { DocsDiagnosticError } from '../../diagnostics'

export const cloudflareApiOrigin = 'https://api.cloudflare.com/client/v4'
export const versionPattern = /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i
export const deploymentMessage = (deploymentId: string) => `repoctl-docs:${deploymentId}`

function validTimestamp(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(value)
    || !Number.isFinite(Date.parse(value))) {
    return false
  }
  const date = value.slice(0, 10)
  return new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) === date
}

async function readPayload(response: Response): Promise<unknown> {
  const reader = response.body?.getReader()
  if (!reader) {
    throw new DocsDiagnosticError('provider-response-invalid')
  }
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) {
        break
      }
      size += chunk.value.length
      if (size > 1_048_576) {
        await reader.cancel()
        throw new DocsDiagnosticError('provider-response-invalid')
      }
      chunks.push(chunk.value)
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  }
  finally {
    reader.releaseLock()
  }
}

export function cloudflareClient(target: DocsCloudflareWorkersTarget, env: NodeJS.ProcessEnv, request: typeof fetch = fetch) {
  const token = env['CLOUDFLARE_API_TOKEN']
  if (!token?.trim()) {
    throw new DocsDiagnosticError('credentials-missing')
  }
  if ((env['CLOUDFLARE_ACCOUNT_ID'] && env['CLOUDFLARE_ACCOUNT_ID'] !== target.accountId)
    || (env['CF_ACCOUNT_ID'] && env['CF_ACCOUNT_ID'] !== target.accountId)
    || (env['CLOUDFLARE_API_BASE_URL'] && env['CLOUDFLARE_API_BASE_URL'] !== cloudflareApiOrigin)
    || (env['CF_API_BASE_URL'] && env['CF_API_BASE_URL'] !== cloudflareApiOrigin)
    || env['CLOUDFLARE_API_KEY'] || env['CF_API_KEY']
    || env['WRANGLER_CI_OVERRIDE_NAME']) {
    throw new DocsDiagnosticError('provider-environment-conflict')
  }
  return async (endpoint: string, allowMissing = false): Promise<unknown> => {
    let response: Response
    let payload: unknown
    try {
      response = await request(`${cloudflareApiOrigin}/accounts/${target.accountId}/workers/scripts/${encodeURIComponent(target.workerName)}/${endpoint}`, {
        headers: { Authorization: `Bearer ${token}` },
        redirect: 'error',
        signal: AbortSignal.timeout(30_000),
      })
      payload = await readPayload(response)
    }
    catch (error) {
      if (error instanceof DocsDiagnosticError) {
        throw error
      }
      throw new DocsDiagnosticError('provider-network-failed')
    }
    if (!isRecord(payload)) {
      throw new DocsDiagnosticError('provider-response-invalid')
    }
    const codes = Array.isArray(payload['errors'])
      ? payload['errors'].flatMap(error => isRecord(error) && Number.isSafeInteger(error['code']) ? [error['code'] as number] : [])
      : []
    if (allowMissing && endpoint === 'deployments' && response.status === 404 && payload['success'] === false
      && Array.isArray(payload['errors']) && payload['errors'].length === 1 && codes.length === 1 && codes[0] === 10007) {
      return undefined
    }
    if (!response.ok || payload['success'] !== true) {
      throw new DocsDiagnosticError(response.status === 401 || response.status === 403 ? 'provider-access-denied' : response.status === 429 ? 'provider-rate-limited' : 'provider-request-rejected')
    }
    if (!isRecord(payload['result']) || (payload['errors'] !== undefined && (!Array.isArray(payload['errors']) || payload['errors'].length > 0))) {
      throw new DocsDiagnosticError('provider-response-invalid')
    }
    return payload['result']
  }
}

export async function activeMatchingVersion(client: ReturnType<typeof cloudflareClient>, deploymentId: string) {
  const result = await client('deployments', true)
  if (result === undefined) {
    return undefined
  }
  if (!isRecord(result) || !Array.isArray(result['deployments']) || result['deployments'].length === 0) {
    throw new DocsDiagnosticError('provider-response-invalid')
  }
  // The API contract defines the first entry as the deployment currently serving traffic.
  const active: unknown = result['deployments'][0]
  if (!isRecord(active) || !validTimestamp(active['created_on']) || active['strategy'] !== 'percentage'
    || !Array.isArray(active['versions']) || active['versions'].length !== 1) {
    throw new DocsDiagnosticError('provider-traffic-ambiguous')
  }
  const version: unknown = active['versions'][0]
  if (!isRecord(version) || version['percentage'] !== 100 || typeof version['version_id'] !== 'string' || !versionPattern.test(version['version_id'])) {
    throw new DocsDiagnosticError('provider-traffic-ambiguous')
  }
  const versionId = version['version_id']
  const detail = await client(`versions/${versionId}`)
  if (!isRecord(detail) || detail['id'] !== versionId || (detail['annotations'] !== undefined && !isRecord(detail['annotations']))) {
    throw new DocsDiagnosticError('provider-version-mismatch')
  }
  const message = isRecord(detail['annotations']) ? detail['annotations']['workers/message'] : undefined
  if (message !== undefined && typeof message !== 'string') {
    throw new DocsDiagnosticError('provider-response-invalid')
  }
  return message === deploymentMessage(deploymentId) ? versionId : undefined
}
