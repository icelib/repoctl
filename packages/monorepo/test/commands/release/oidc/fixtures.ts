import { Buffer } from 'node:buffer'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { vi } from 'vitest'
import { createTempWorkspace } from '../../release-fixtures'

export const claims = {
  iss: 'https://token.actions.githubusercontent.com',
  aud: 'npm:registry.npmjs.org',
  sub: 'repo:acme@123/repo@456:ref:refs/heads/main',
  repository: 'acme/repo',
  workflow_ref: 'acme/repo/.github/workflows/release.yml@refs/heads/main',
  runner_environment: 'github-hosted',
  event_name: 'workflow_dispatch',
}
export const requestToken = 'test-request-secret-never-log'
export const exchangeToken = 'test-exchange-secret-never-log'
export const env = {
  ACTIONS_ID_TOKEN_REQUEST_URL: 'https://oidc.actions.githubusercontent.com/token?existing=1',
  ACTIONS_ID_TOKEN_REQUEST_TOKEN: requestToken,
  GITHUB_REPOSITORY: claims.repository,
  GITHUB_WORKFLOW_REF: claims.workflow_ref,
}

export function tokenFor(payload: Record<string, unknown>) {
  return `eyJhbGciOiJSUzI1NiJ9.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.test-signature`
}

export const idToken = tokenFor(claims)

export function json(value: unknown, status = 201) {
  return new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } })
}

export function mockFetch(exchange: (name: string) => Response | Promise<Response> = () => json({ token: exchangeToken }), identity: unknown = { value: idToken }) {
  return vi.fn<typeof globalThis.fetch>(async (input) => {
    const url = new URL(String(input))
    if (url.hostname === 'oidc.actions.githubusercontent.com') {
      return json(identity, 200)
    }
    return exchange(decodeURIComponent(url.pathname.slice(url.pathname.lastIndexOf('/') + 1)))
  })
}

export async function workspace(names = ['repoctl']) {
  const cwd = await createTempWorkspace()
  await writeFile(path.join(cwd, 'package.json'), JSON.stringify({ name: 'public-root', version: '1.0.0', scripts: { build: 'must-not-run' } }))
  for (const [index, name] of names.entries()) {
    const dir = path.join(cwd, 'packages', index === 0 ? 'repoctl' : `p${index}`)
    await mkdir(dir, { recursive: true })
    await writeFile(path.join(dir, 'package.json'), JSON.stringify({ name, version: '1.0.0' }))
  }
  return cwd
}
