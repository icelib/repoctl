import type { PreparedSnapshotPublishOptions } from '../../../../../../src/commands/release/snapshot/prepared/publish/types'
import { Buffer } from 'node:buffer'
import { readFileSync } from 'node:fs'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { afterEach, expect } from 'vitest'
import { snapshotIdentity } from '../../../../../../src/commands/release/snapshot/identity'
import { githubFixture } from '../github/fixture'

const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
})

export async function publicationFixture() {
  const h = githubFixture()
  const directory = await mkdtemp(path.join(tmpdir(), 'repo-prepared-publication-'))
  roots.push(directory)
  const { plan, manifest } = h.prepared
  const { source } = plan
  const publisher = '.github/workflows/repoctl-snapshot-publish.yml'
  const env = {
    ...process.env,
    GITHUB_ACTIONS: 'true',
    GITHUB_EVENT_NAME: 'workflow_run',
    GITHUB_REPOSITORY: source.repository,
    GITHUB_WORKFLOW_REF: `${source.repository}/${publisher}@refs/heads/main`,
    GITHUB_REF: 'refs/heads/main',
    GITHUB_SHA: source.workflowSha,
    GITHUB_EVENT_PATH: path.join(directory, 'event.json'),
    GITHUB_TOKEN: 'github-secret',
    ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'request-secret',
    ACTIONS_ID_TOKEN_REQUEST_URL: 'https://oidc.example/request',
    NODE_AUTH_TOKEN: 'must-not-reach-pnpm',
    NODE_OPTIONS: '--require /malicious-candidate.js',
    npm_config_registry: 'https://candidate.invalid/',
    npm_config_userconfig: '/candidate/.npmrc',
  }
  await writeFile(env.GITHUB_EVENT_PATH, JSON.stringify({ repository: { id: source.repositoryId, full_name: source.repository }, workflow_run: { id: source.runId, run_attempt: source.runAttempt, conclusion: 'success' } }))
  const claims = {
    iss: 'https://token.actions.githubusercontent.com',
    aud: 'npm:registry.npmjs.org',
    repository: source.repository,
    repository_id: String(source.repositoryId),
    workflow_ref: env.GITHUB_WORKFLOW_REF,
    runner_environment: 'github-hosted',
    event_name: 'workflow_run',
  }
  const tags = new Map(manifest.packages.map(pkg => [pkg.name, { latest: '1.0.0' } as Record<string, string>]))
  const versions = new Map<string, Record<string, unknown>>()
  const uploads: string[] = []
  const commands: string[][] = []
  const oidc: string[] = []
  const faults = { upload: '', oidc: '', registry: 0, transient: 0, acceptedError: false, beforeOidc: undefined as (() => void) | undefined, afterUpload: undefined as ((name: string) => void) | undefined }
  function metadata(name: string) {
    const index = manifest.packages.findIndex(pkg => pkg.name === name)
    return { ...h.prepared.manifests[index]!, dist: { integrity: manifest.packages[index]!.integrity } }
  }
  function published(name: string) {
    const pkg = manifest.packages.find(pkg => pkg.name === name)!
    versions.set(`${name}@${pkg.version}`, metadata(name))
    tags.get(name)![plan.tag] = pkg.version
  }
  function previous(name: string, buildId = 'run-122-attempt-1') {
    const { identity, key, tag } = snapshotIdentity({ cwd: '', identity: { kind: 'pr', pullRequest: source.pullRequest, commit: 'e'.repeat(40), buildId } })
    const version = `1.0.1-snapshot.pr.${source.pullRequest}.c${identity.commit}.b${key}`
    const value = { name, version, repoctlSnapshot: { ...identity, identityKey: key, tag }, dist: { integrity: manifest.packages[0]!.integrity } }
    versions.set(`${name}@${version}`, value)
    tags.get(name)![plan.tag] = version
    return value
  }
  const fetcher: typeof globalThis.fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input))
    if (url.hostname === 'oidc.example') {
      faults.beforeOidc?.()
      oidc.push('identity')
      return Response.json({ value: `header.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.signature` })
    }
    if (url.pathname.startsWith('/-/npm/v1/oidc/token/exchange/package/')) {
      const name = decodeURIComponent(url.pathname.split('/').at(-1)!)
      oidc.push(name)
      return faults.oidc === name ? Response.json({ message: 'publisher denied' }, { status: 403 }) : Response.json({ token: 'temporary-token-not-saved' }, { status: 201 })
    }
    return h.fetcher(input, init)
  }
  const registryFetch: typeof globalThis.fetch = async (input) => {
    const url = new URL(input instanceof Request ? input.url : String(input))
    expect(url.origin).toBe('https://registry.npmjs.org')
    if (faults.registry) {
      return new Response('', { status: faults.registry })
    }
    if (url.pathname.startsWith('/-/package/')) {
      const name = decodeURIComponent(url.pathname.slice('/-/package/'.length, -'/dist-tags'.length))
      return Response.json(tags.get(name) ?? {})
    }
    const [name, version] = url.pathname.slice(1).split('/').map(decodeURIComponent)
    const value = versions.get(`${name}@${version}`)
    return value ? Response.json(value) : new Response('', { status: 404 })
  }
  const spawn: NonNullable<PreparedSnapshotPublishOptions['spawn']> = ((command, args, settings) => {
    const values = args as string[]
    expect(command).toBe('pnpm')
    expect(values).toContain('publish')
    expect(values).toContain('--ignore-scripts')
    expect(values).toContain('--config.ignore-pnpmfile=true')
    expect(values).toContain('--provenance')
    expect(values).not.toContain('--filter')
    expect(settings?.env?.['NODE_OPTIONS']).toBeUndefined()
    expect(settings?.env?.['NODE_AUTH_TOKEN']).toBeUndefined()
    expect(settings?.env?.['GITHUB_TOKEN']).toBeUndefined()
    expect(settings?.env?.['GITHUB_SHA']).toBe(source.workflowSha)
    expect(settings?.env?.['GITHUB_EVENT_NAME']).toBe('workflow_run')
    expect(settings?.env?.['npm_config_registry']).toBe(plan.registry)
    commands.push(values)
    const filename = values[values.indexOf('publish') + 1]!
    const bytes = readFileSync(filename)
    const pkg = manifest.packages.find(pkg => Buffer.from(h.prepared.files.get(pkg.tarball)!).equals(bytes))!
    expect(pkg).toBeDefined()
    if (faults.transient > 0) {
      faults.transient--
      return { status: 1, signal: null, stdout: '', stderr: 'E503 temporary upload failure', pid: 1, output: [null, '', 'E503 temporary upload failure'] }
    }
    if (faults.upload === pkg.name) {
      return { status: 1, signal: null, stdout: '', stderr: 'E403 upload denied', pid: 1, output: [null, '', 'E403 upload denied'] }
    }
    uploads.push(pkg.name)
    published(pkg.name)
    faults.afterUpload?.(pkg.name)
    if (faults.acceptedError) {
      return { status: 1, signal: null, stdout: '', stderr: 'E503 response lost after upload', pid: 1, output: [null, '', 'E503 response lost after upload'] }
    }
    return { status: 0, signal: null, stdout: '', stderr: '', pid: 1, output: [null, '', ''] }
  }) as NonNullable<PreparedSnapshotPublishOptions['spawn']>
  const options: PreparedSnapshotPublishOptions = { ...h.options, outputDirectory: path.join(directory, 'output'), fetch: fetcher, registryFetch, env, spawn, sleep: async () => {} }
  return { ...h, options, directory, env, claims, tags, versions, uploads, commands, oidc, faults, metadata, published, previous }
}
