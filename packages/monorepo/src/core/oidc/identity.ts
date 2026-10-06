import { Buffer } from 'node:buffer'

export const npmRegistry = 'https://registry.npmjs.org'
export const npmAudience = 'npm:registry.npmjs.org'
export const requestTimeout = 15_000

const identityKeys = [
  'iss',
  'aud',
  'sub',
  'repository',
  'repository_id',
  'repository_owner_id',
  'workflow_ref',
  'job_workflow_ref',
  'event_name',
  'runner_environment',
  'environment',
] as const

export function publicMessage(value: unknown, secrets: string[]) {
  let message = typeof value === 'string' ? value : 'npm did not return a recognizable error message'
  for (const secret of secrets) {
    if (secret) {
      message = message.replaceAll(secret, '[redacted]')
    }
  }
  return message
    .replaceAll(/\beyJ[\w-]+\.[\w-]+\.[\w-]+\b/g, '[redacted]')
    .replaceAll(/\bnpm_[a-z0-9]+\b/gi, '[redacted]')
    .replaceAll(/\p{Cc}/gu, ' ')
    .slice(0, 500)
}

export function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

export async function requestIdentity(env: NodeJS.ProcessEnv, fetcher: typeof globalThis.fetch) {
  const requestToken = env['ACTIONS_ID_TOKEN_REQUEST_TOKEN']
  const requestUrl = env['ACTIONS_ID_TOKEN_REQUEST_URL']
  if (!requestToken || !requestUrl || !env['GITHUB_REPOSITORY'] || !env['GITHUB_WORKFLOW_REF']) {
    throw new Error('OIDC audit requires a GitHub-hosted job with id-token: write, GITHUB_REPOSITORY and GITHUB_WORKFLOW_REF')
  }
  let response: Response
  try {
    const url = new URL(requestUrl)
    if (url.protocol !== 'https:' || url.username || url.password) {
      throw new Error('invalid OIDC request URL')
    }
    url.searchParams.set('audience', npmAudience)
    response = await fetcher(url, {
      headers: { Authorization: `Bearer ${requestToken}` },
      signal: AbortSignal.timeout(requestTimeout),
      redirect: 'error',
    })
  }
  catch {
    throw new Error('GitHub OIDC request failed, timed out or returned an invalid response; no credentials were saved')
  }
  if (!response.ok) {
    throw new Error(`GitHub OIDC request failed: HTTP ${response.status}`)
  }
  let body: Record<string, unknown>
  try {
    body = record(await response.json())
  }
  catch {
    throw new Error('GitHub OIDC returned an invalid JSON response')
  }
  if (typeof body['value'] !== 'string' || !body['value']) {
    throw new Error('GitHub OIDC response is missing an identity token')
  }
  const idToken = body['value']
  let claims: Record<string, unknown>
  try {
    const segments = idToken.split('.')
    if (segments.length !== 3) {
      throw new Error('invalid JWT')
    }
    claims = record(JSON.parse(Buffer.from(segments[1]!, 'base64url').toString('utf8')))
  }
  catch {
    throw new Error('GitHub OIDC identity claims could not be parsed')
  }
  if (claims['iss'] !== 'https://token.actions.githubusercontent.com'
    || claims['aud'] !== npmAudience
    || claims['repository'] !== env['GITHUB_REPOSITORY']
    || claims['workflow_ref'] !== env['GITHUB_WORKFLOW_REF']
    || claims['runner_environment'] !== 'github-hosted') {
    throw new Error('GitHub OIDC identity does not match the current GitHub-hosted workflow; no npm exchanges were attempted')
  }
  const identity = Object.fromEntries(identityKeys
    .filter(key => typeof claims[key] === 'string')
    .map(key => [key, publicMessage(claims[key], [idToken, requestToken])]))
  return { idToken, requestToken, identity }
}
