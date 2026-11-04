import type { BootstrapManifest, BootstrapOptions, BootstrapReport } from '../../../../src/commands/release/bootstrap/types'
import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { consumeTarball } from '../../../../src/commands/package-check/consumer'
import { verifyBootstrapConsumer } from '../../../../src/commands/release/bootstrap/consumer'
import { bootstrapBundle } from '../../../../src/commands/release/bootstrap/evidence'
import { prepareBootstrap } from '../../../../src/commands/release/bootstrap/prepare'
import { verifyBootstrapProvenance } from '../../../../src/commands/release/bootstrap/provenance'
import { publishBootstrap } from '../../../../src/commands/release/bootstrap/publication'
import { auditReleaseOidc } from '../../../../src/commands/release/oidc'
import { publishWithRetry } from '../../../../src/commands/release/publish'
import { writeSnapshotArchive } from '../../../../src/commands/release/snapshot/archive'
import { isolatedPnpmOptions, snapshotCommand } from '../../../../src/commands/release/snapshot/process'

vi.mock('../../../../src/commands/release/bootstrap/evidence', () => ({ bootstrapBundle: vi.fn() }))
vi.mock('../../../../src/commands/release/oidc', () => ({ auditReleaseOidc: vi.fn() }))
vi.mock('../../../../src/commands/release/publish', () => ({ publishWithRetry: vi.fn() }))
vi.mock('../../../../src/commands/release/bootstrap/provenance', () => ({ verifyBootstrapProvenance: vi.fn() }))
vi.mock('../../../../src/commands/release/bootstrap/prepare', () => ({ prepareBootstrap: vi.fn() }))
vi.mock('../../../../src/commands/release/bootstrap/consumer', () => ({ verifyBootstrapConsumer: vi.fn() }))
vi.mock('../../../../src/commands/package-check/consumer', () => ({ consumeTarball: vi.fn() }))
vi.mock('../../../../src/commands/release/snapshot/process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../src/commands/release/snapshot/process')>()
  return { ...actual, snapshotCommand: vi.fn(actual.snapshotCommand) }
})

const roots: string[] = []
beforeEach(() => vi.clearAllMocks())
afterEach(async () => {
  await Promise.all(roots.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
})

async function fixture() {
  const directory = await mkdtemp(path.join(tmpdir(), 'repo-bootstrap-publication-'))
  roots.push(directory)
  const source = { repository: 'acme/repo', repositoryId: 12, commit: 'a'.repeat(40), branch: 'main', runId: 123, runAttempt: 2, workflowRef: 'acme/repo/.github/workflows/release.yml@refs/heads/main' }
  const name = '@scope/new-package'
  const version = '0.1.0-alpha.0'
  const registry = 'https://registry.npmjs.org/' as const
  const packedManifest = { name, version, type: 'module', exports: './index.js', publishConfig: { access: 'public', registry, tag: 'alpha' } }
  const tarball = writeSnapshotArchive([
    { path: 'package/package.json', mode: 0o644, type: 'File', data: Buffer.from(JSON.stringify(packedManifest)) },
    { path: 'package/index.js', mode: 0o644, type: 'File', data: Buffer.from('export const value = 42\n') },
  ])
  const files = ['index.js', 'package.json']
  const manifest: BootstrapManifest = {
    schemaVersion: 1,
    source,
    registry,
    tag: 'alpha',
    pnpmVersion: '12.14.0',
    buildDirectories: ['packages/new-package'],
    protectedTags: ['latest', 'legacy'],
    package: { name, directory: 'packages/new-package', currentVersion: '0.0.0', version, tarball: 'tarballs/package.tgz', integrity: `sha512-${createHash('sha512').update(tarball).digest('base64')}`, files },
    checks: { build: 'passed', package: { name, directory: 'packages/new-package', role: 'selected', status: 'passed', files, diagnostics: [], commands: [] } },
    entries: [{ subpath: '.', target: './index.js', format: 'esm', runtime: true }],
    packedManifest,
  }
  const env: NodeJS.ProcessEnv = {
    PATH: process.env['PATH'],
    HOME: process.env['HOME'],
    SystemRoot: process.env['SystemRoot'],
    GITHUB_ACTIONS: 'true',
    GITHUB_EVENT_NAME: 'workflow_dispatch',
    GITHUB_REPOSITORY: source.repository,
    GITHUB_REPOSITORY_ID: String(source.repositoryId),
    GITHUB_REF: 'refs/heads/main',
    GITHUB_SHA: source.commit,
    GITHUB_RUN_ID: String(source.runId),
    GITHUB_RUN_ATTEMPT: String(source.runAttempt),
    GITHUB_WORKFLOW_REF: source.workflowRef,
    GITHUB_TOKEN: 'github-secret',
    ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'oidc-request-secret',
    ACTIONS_ID_TOKEN_REQUEST_URL: 'https://oidc.example/request',
    NODE_AUTH_TOKEN: 'npm-secret',
    NPM_TOKEN: 'legacy-npm-secret',
    NODE_OPTIONS: '--require /candidate/unsafe.cjs',
    PRIVATE_PUBLISH_SECRET: 'custom-secret',
    npm_config_registry: 'https://candidate.invalid/',
    npm_config_userconfig: '/candidate/.npmrc',
  }
  const tags: Record<string, string> = { latest: '1.0.0', legacy: '0.9.0' }
  const state = { existing: false, published: false, visible: true, attestations: true, installationFails: false }
  const provenanceUrl = `https://registry.npmjs.org/-/npm/v1/attestations/${encodeURIComponent(name)}@${version}`
  const registryFetch: typeof globalThis.fetch = async (input) => {
    const url = new URL(input instanceof Request ? input.url : String(input))
    expect(url.origin).toBe('https://registry.npmjs.org')
    if (url.pathname.endsWith('/dist-tags')) {
      return Response.json(tags)
    }
    if ((state.existing || state.published) && state.visible) {
      return Response.json({ name, version, dist: { integrity: manifest.package.integrity, ...(state.attestations ? { attestations: { url: provenanceUrl, provenance: { predicateType: 'https://slsa.dev/provenance/v1' } } } : {}) } })
    }
    return new Response('', { status: 404 })
  }
  const commands: Array<{ executable: string, args: string[], env: NodeJS.ProcessEnv | undefined }> = []
  const spawn: NonNullable<BootstrapOptions['spawn']> = ((executable, args, settings) => {
    commands.push({ executable, args: [...(args ?? [])], env: settings?.env })
    return { status: state.installationFails ? 1 : 0, signal: null, stdout: '', stderr: state.installationFails ? 'toolchain install failed' : '', pid: 1, output: [null, '', ''] }
  }) as NonNullable<BootstrapOptions['spawn']>
  const options: BootstrapOptions = { cwd: directory, packageName: name, version, outputDirectory: path.join(directory, 'evidence'), env, registryFetch, spawn, sleep: async () => {} }
  vi.mocked(bootstrapBundle).mockResolvedValue({ manifest, tarball, files: new Map<string, Uint8Array>([['bootstrap-manifest.json', Buffer.from(JSON.stringify(manifest))], [manifest.package.tarball, tarball]]), context: { env, repository: source.repository, branch: source.branch, currentRun: source.runId }, artifact: { id: 456, digest: `sha256:${'b'.repeat(64)}`, runId: source.runId, runAttempt: source.runAttempt } })
  vi.mocked(auditReleaseOidc).mockResolvedValue({ schemaVersion: 1, ok: true, identity: { repository_id: String(source.repositoryId), event_name: 'workflow_dispatch' }, results: [{ package: name, ok: true, status: 201, message: 'exchange succeeded' }], hints: [] })
  vi.mocked(verifyBootstrapProvenance).mockResolvedValue(undefined)
  vi.mocked(publishWithRetry).mockImplementation(async (_args, execution, candidates, _confirmAll, checkpoint) => {
    await execution.beforeAttempt?.()
    await checkpoint?.save(candidates)
    state.published = true
    tags['alpha'] = version
  })
  return { options, manifest, tarball, tags, state, commands, provenanceUrl, directory }
}

it('uploads the original tarball for only the selected package with provenance and a pinned sterile toolchain', async () => {
  const h = await fixture()
  const report = await publishBootstrap(h.options)
  expect(report.status, report.error).toBe('published')
  expect(report.accepted).toBe(true)
  expect(report.confirmed).toBe(true)
  expect(bootstrapBundle).toHaveBeenCalledWith(h.options, 'prepared')
  expect(auditReleaseOidc).toHaveBeenCalledOnce()
  expect(auditReleaseOidc).toHaveBeenCalledWith({ packages: [{ name: h.manifest.package.name, version: h.manifest.package.version, registry: h.manifest.registry }], env: expect.any(Object) })
  const [args, execution, candidates, confirmAll] = vi.mocked(publishWithRetry).mock.calls[0]!
  const filename = path.join(h.options.outputDirectory!, 'tarballs/package.tgz')
  expect(args).toEqual([...isolatedPnpmOptions, '--config.ignore-pnpmfile=true', 'publish', filename, '--ignore-scripts', '--no-git-checks', '--access', 'public', '--provenance', '--tag', 'alpha', '--registry', h.manifest.registry])
  expect(await readFile(filename)).toEqual(Buffer.from(h.tarball))
  expect(candidates).toEqual([{ name: h.manifest.package.name, version: h.manifest.package.version }])
  expect(confirmAll).toBe(false)
  expect(execution).toMatchObject({ cwd: h.options.outputDirectory, deferConfirmation: true })
  for (const key of ['GITHUB_TOKEN', 'NODE_AUTH_TOKEN', 'NPM_TOKEN', 'NODE_OPTIONS', 'PRIVATE_PUBLISH_SECRET']) {
    expect(execution.env?.[key]).toBeUndefined()
  }
  expect(execution.env?.['ACTIONS_ID_TOKEN_REQUEST_TOKEN']).toBe('oidc-request-secret')
  expect(execution.env?.['npm_config_registry']).toBe(h.manifest.registry)
  expect(h.commands).toHaveLength(1)
  const installation = h.commands[0]!
  const toolchain = installation.args[2]!
  expect(execution.env?.['PATH']?.split(path.delimiter)[0]).toBe(path.join(toolchain, 'node_modules/.bin'))
  expect(installation.executable).toBe('npm')
  expect(installation.args).toEqual(['install', '--prefix', toolchain, '--ignore-scripts', '--no-package-lock', '--no-audit', '--no-fund', `pnpm@${h.manifest.pnpmVersion}`, '--registry', h.manifest.registry])
  const relativeToolchain = path.relative(h.options.outputDirectory!, toolchain)
  expect(relativeToolchain === '..' || relativeToolchain.startsWith(`..${path.sep}`) || path.isAbsolute(relativeToolchain)).toBe(true)
  expect(existsSync(toolchain)).toBe(false)
  for (const key of ['GITHUB_TOKEN', 'ACTIONS_ID_TOKEN_REQUEST_TOKEN', 'ACTIONS_ID_TOKEN_REQUEST_URL', 'NODE_AUTH_TOKEN', 'NPM_TOKEN', 'NODE_OPTIONS', 'PRIVATE_PUBLISH_SECRET']) {
    expect(installation.env?.[key]).toBeUndefined()
  }
  expect(verifyBootstrapProvenance).toHaveBeenCalledWith(h.manifest, h.provenanceUrl, h.options)
  expect(report.latestState).toEqual({ before: '1.0.0', after: '1.0.0', bootstrapPromoted: false })
  expect(await readFile(path.join(h.options.outputDirectory!, 'user.npmrc'), 'utf8')).toBe('')
  expect(await readFile(path.join(h.options.outputDirectory!, 'global.npmrc'), 'utf8')).toBe('')
  const saved = await readFile(path.join(h.options.outputDirectory!, 'bootstrap-report.json'), 'utf8')
  for (const secret of ['github-secret', 'oidc-request-secret', 'npm-secret', 'legacy-npm-secret', 'custom-secret']) {
    expect(saved).not.toContain(secret)
  }
  expect(prepareBootstrap).not.toHaveBeenCalled()
  expect(verifyBootstrapConsumer).not.toHaveBeenCalled()
  expect(consumeTarball).not.toHaveBeenCalled()
  expect(snapshotCommand).toHaveBeenCalledOnce()
  expect(vi.mocked(snapshotCommand).mock.calls[0]?.[0]).toBe('npm')
  expect(await readdir(h.options.outputDirectory!)).not.toContain('source')
  expect(await readdir(h.options.outputDirectory!)).not.toContain('toolchain')
})

it('passes quiet output through to the upload helper', async () => {
  const h = await fixture()
  const report = await publishBootstrap({ ...h.options, quiet: true })
  expect(report.status, report.error).toBe('published')
  expect(vi.mocked(publishWithRetry).mock.calls[0]?.[1].quiet).toBe(true)
})

it('rejects an existing version before auditing OIDC or attempting another upload', async () => {
  const h = await fixture()
  h.state.existing = true
  const report = await publishBootstrap(h.options)
  expect(report.status).toBe('failed')
  expect(report.error).toContain('version already exists')
  expect(report.accepted).toBe(false)
  expect(auditReleaseOidc).not.toHaveBeenCalled()
  expect(publishWithRetry).not.toHaveBeenCalled()
  expect(h.commands).toEqual([])
})

it('preserves original publication evidence when an output directory is reused', async () => {
  const h = await fixture()
  await publishBootstrap(h.options)
  const filename = path.join(h.options.outputDirectory!, 'bootstrap-report.json')
  const original = await readFile(filename)
  await expect(publishBootstrap(h.options)).rejects.toThrow('must be empty')
  expect(await readFile(filename)).toEqual(original)
  expect(publishWithRetry).toHaveBeenCalledOnce()
})

it('stops before OIDC and upload if the pinned toolchain cannot be installed', async () => {
  const h = await fixture()
  h.state.installationFails = true
  const report = await publishBootstrap(h.options)
  expect(report.status).toBe('failed')
  expect(report.accepted).toBe(false)
  expect(report.error).toContain('toolchain install failed')
  expect(auditReleaseOidc).not.toHaveBeenCalled()
  expect(publishWithRetry).not.toHaveBeenCalled()
  expect(existsSync(h.commands[0]!.args[2]!)).toBe(false)
})

it.each(['denied', 'repository', 'event'] as const)('does not upload after a failed or mismatched OIDC exchange: %s', async (fault) => {
  const h = await fixture()
  const audit = await vi.mocked(auditReleaseOidc).getMockImplementation()!({ packages: [] })
  if (fault === 'denied') {
    audit.ok = false
  }
  else {
    audit.identity[fault === 'repository' ? 'repository_id' : 'event_name'] = 'mismatch'
  }
  vi.mocked(auditReleaseOidc).mockResolvedValue(audit)
  const report = await publishBootstrap(h.options)
  expect(report.status).toBe('failed')
  expect(report.accepted).toBe(false)
  expect(publishWithRetry).not.toHaveBeenCalled()
  expect(verifyBootstrapProvenance).not.toHaveBeenCalled()
})

it('persists accepted upload evidence when registry confirmation times out without trying another upload', async () => {
  const h = await fixture()
  h.state.visible = false
  const report = await publishBootstrap(h.options)
  expect(report.status).toBe('failed')
  expect(report.error).toContain('confirmation timed out')
  expect(report.accepted).toBe(true)
  expect(report.confirmed).toBe(false)
  expect(publishWithRetry).toHaveBeenCalledOnce()
  const checkpoint = JSON.parse(await readFile(path.join(h.options.outputDirectory!, 'bootstrap-report.json'), 'utf8')) as BootstrapReport
  expect(checkpoint).toMatchObject({ status: 'failed', accepted: true, confirmed: false })
  expect(checkpoint.manifest?.package.integrity).toBe(h.manifest.package.integrity)
  expect(existsSync(h.commands[0]!.args[2]!)).toBe(false)
})

it('retains the accepted checkpoint when the upload helper throws after registry acceptance', async () => {
  const h = await fixture()
  vi.mocked(publishWithRetry).mockImplementation(async (_args, _execution, candidates, _confirmAll, checkpoint) => {
    await checkpoint?.save(candidates)
    throw new Error('Upload response lost after acceptance')
  })
  const report = await publishBootstrap(h.options)
  expect(report).toMatchObject({ status: 'failed', accepted: true, confirmed: false })
  expect(report.error).toContain('response lost')
  expect(publishWithRetry).toHaveBeenCalledOnce()
})

it('fails confirmation when provenance does not bind to the original source workflow run', async () => {
  const h = await fixture()
  vi.mocked(verifyBootstrapProvenance).mockRejectedValue(new Error('Bootstrap provenance source differs from the frozen default branch commit'))
  const report = await publishBootstrap(h.options)
  expect(report).toMatchObject({ status: 'failed', accepted: true, confirmed: false })
  expect(report.error).toContain('provenance source differs')
  expect(publishWithRetry).toHaveBeenCalledOnce()
})
