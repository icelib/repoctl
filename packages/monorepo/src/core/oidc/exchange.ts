import type { ReleaseOidcPackageResult } from './types'
import { npmRegistry, publicMessage, record, requestTimeout } from './identity'

export async function exchangePackage(name: string, idToken: string, requestToken: string, fetcher: typeof globalThis.fetch): Promise<ReleaseOidcPackageResult> {
  try {
    const response = await fetcher(new URL(`/-/npm/v1/oidc/token/exchange/package/${encodeURIComponent(name)}`, npmRegistry), {
      method: 'POST',
      headers: { Authorization: `Bearer ${idToken}`, Accept: 'application/json' },
      body: '',
      signal: AbortSignal.timeout(requestTimeout),
      redirect: 'error',
    })
    let body: Record<string, unknown>
    try {
      body = record(await response.json())
    }
    catch {
      return { package: name, ok: false, status: response.status, message: 'npm returned an invalid JSON response' }
    }
    const token = typeof body['token'] === 'string' ? body['token'] : ''
    const ok = response.ok && token.length > 0
    return {
      package: name,
      ok,
      status: response.status,
      message: ok
        ? 'OIDC token exchange succeeded'
        : response.ok
          ? 'npm response is missing an exchange token'
          : publicMessage(body['message'] ?? record(body['body'])['message'], [idToken, requestToken, token]),
    }
  }
  catch {
    return { package: name, ok: false, status: null, message: 'npm token exchange request failed or timed out' }
  }
}
