import type { BootstrapReport } from '@/commands/release/bootstrap/types'
import { Buffer } from 'node:buffer'
import { existsSync } from 'node:fs'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { releaseBootstrap } from '@/commands/release/bootstrap'
import { verifyBootstrapPublication } from '@/commands/release/bootstrap/recovery'
import { evidenceFixture } from './evidenceFixture'

const calls = vi.hoisted(() => ({
  bootstrapBundle: vi.fn(),
  confirmBootstrapRegistry: vi.fn(),
  verifyBootstrapConsumer: vi.fn(),
  auditReleaseOidc: vi.fn(),
  publishWithRetry: vi.fn(),
  createBootstrapPlan: vi.fn(),
  prepareBootstrap: vi.fn(),
}))
vi.mock('@/commands/release/bootstrap/evidence', () => ({ bootstrapBundle: calls.bootstrapBundle }))
vi.mock('@/commands/release/bootstrap/registry', async original => ({ ...await original<typeof import('@/commands/release/bootstrap/registry')>(), confirmBootstrapRegistry: calls.confirmBootstrapRegistry }))
vi.mock('@/commands/release/bootstrap/consumer', () => ({ verifyBootstrapConsumer: calls.verifyBootstrapConsumer }))
vi.mock('@/commands/release/oidc', () => ({ auditReleaseOidc: calls.auditReleaseOidc }))
vi.mock('@/commands/release/publish', () => ({ publishWithRetry: calls.publishWithRetry }))
vi.mock('@/commands/release/bootstrap/plan', () => ({ createBootstrapPlan: calls.createBootstrapPlan }))
vi.mock('@/commands/release/bootstrap/prepare', () => ({ prepareBootstrap: calls.prepareBootstrap }))

const directories: string[] = []

beforeEach(() => {
  Object.values(calls).forEach(call => call.mockReset())
  calls.confirmBootstrapRegistry.mockImplementation(async (report: BootstrapReport) => {
    report.confirmed = true
    report.latestState = { before: '0.0.0-stage', after: report.manifest!.package.version, bootstrapPromoted: true }
    report.provenance = { url: 'https://registry.npmjs.org/-/npm/v1/attestations/fixture', predicateType: 'https://slsa.dev/provenance/v1' }
  })
  calls.verifyBootstrapConsumer.mockImplementation(async (report: BootstrapReport) => {
    report.consumer = { status: 'passed', commands: [], packages: [{ name: report.manifest!.package.name, version: report.manifest!.package.version }] }
  })
  for (const call of [calls.auditReleaseOidc, calls.publishWithRetry, calls.createBootstrapPlan, calls.prepareBootstrap]) {
    call.mockRejectedValue(new Error('Recovery must not invoke building or publication'))
  }
})

afterEach(async () => {
  vi.restoreAllMocks()
  await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
})

async function fixture() {
  const h = evidenceFixture('publication')
  const root = await mkdtemp(path.join(tmpdir(), 'bootstrap-recovery-'))
  directories.push(root)
  const outputDirectory = path.join(root, 'verification')
  const spawn = vi.fn()
  const registryFetch = vi.fn<typeof globalThis.fetch>().mockRejectedValue(new Error('Recovery registry transport must be mocked by the verification phase'))
  const options = { ...h.options, outputDirectory, spawn, registryFetch }
  const original = Buffer.from(h.files.get('bootstrap-report.json')!)
  calls.bootstrapBundle.mockResolvedValue({
    manifest: h.manifest,
    tarball: h.tarball,
    files: h.files,
    context: { env: h.env, repository: h.manifest.source.repository, branch: h.manifest.source.branch, currentRun: 999 },
    artifact: { id: h.artifact.id, digest: h.artifact.digest, runId: h.manifest.source.runId, runAttempt: h.manifest.source.runAttempt },
  })
  const setSourceReport = (value: unknown) => h.files.set('bootstrap-report.json', Buffer.from(JSON.stringify(value)))
  return { ...h, options, outputDirectory, spawn, registryFetch, original, setSourceReport }
}

function expectNoPublication(h: Awaited<ReturnType<typeof fixture>>) {
  for (const call of [calls.auditReleaseOidc, calls.publishWithRetry, calls.createBootstrapPlan, calls.prepareBootstrap, h.spawn, h.registryFetch]) {
    expect(call).not.toHaveBeenCalled()
  }
  expect(h.requests).toEqual([])
}

it('verifies an accepted upload from a failed run while preserving its exact original report', async () => {
  const h = await fixture()
  const report = await verifyBootstrapPublication(h.options)
  expect(calls.bootstrapBundle).toHaveBeenCalledExactlyOnceWith(h.options, 'publication')
  expect(report).toMatchObject({
    status: 'verified',
    accepted: true,
    confirmed: true,
    manifest: h.manifest,
    baselineTags: { latest: '0.0.0-stage' },
    verification: { sourceRunId: 123, sourceRunAttempt: 2, artifactId: 1001, artifactDigest: h.artifact.digest, runId: 999, runAttempt: 3, checkedAt: expect.any(String) },
    consumer: { status: 'passed', packages: [{ name: '@scope/new', version: '1.0.0-alpha.0' }] },
  })
  expect(report.error).toBeUndefined()
  expect(await readFile(path.join(h.outputDirectory, 'source-publication-report.json'))).toEqual(h.original)
  const original: unknown = JSON.parse(h.original.toString())
  expect(original).toMatchObject({ status: 'failed', accepted: true, error: 'Original registry confirmation timed out' })
  expect(Buffer.from(h.files.get('bootstrap-report.json')!)).toEqual(h.original)
  expect(await readFile(path.join(h.outputDirectory, h.manifest.package.tarball))).toEqual(Buffer.from(h.tarball))
  expect(JSON.parse(await readFile(path.join(h.outputDirectory, 'bootstrap-report.json'), 'utf8'))).toEqual(report)
  expectNoPublication(h)
})

it('routes verify-run-id through recovery even when the caller selected publish', async () => {
  const h = await fixture()
  const report = await releaseBootstrap({ ...h.options, stage: 'publish' })
  expect(report.status).toBe('verified')
  expect(calls.bootstrapBundle).toHaveBeenCalledWith(expect.objectContaining({ verifyRunId: 123 }), 'publication')
  expectNoPublication(h)
})

const missingAcceptance: Array<[string, (h: Awaited<ReturnType<typeof fixture>>) => void]> = [
  ['missing original report', (h) => { h.files.delete('bootstrap-report.json') }],
  ['upload not accepted', (h) => { h.setSourceReport({ ...h.sourceReport, accepted: false }) }],
  ['string acceptance claim', (h) => { h.setSourceReport({ ...h.sourceReport, accepted: 'true' }) }],
  ['missing acceptance', (h) => {
    const report: Record<string, unknown> = { ...h.sourceReport }
    delete report['accepted']
    h.setSourceReport(report)
  }],
  ['another report schema', (h) => { h.setSourceReport({ ...h.sourceReport, schemaVersion: 2 }) }],
  ['another prepared manifest', (h) => { h.setSourceReport({ ...h.sourceReport, manifest: { ...h.manifest, tag: 'beta' } }) }],
  ['invalid original tag baseline', (h) => { h.setSourceReport({ ...h.sourceReport, baselineTags: { latest: 123 } }) }],
]

it.each(missingAcceptance)('rejects %s before registry or consumer checks', async (_, mutate) => {
  const h = await fixture()
  mutate(h)
  await expect(verifyBootstrapPublication(h.options)).rejects.toThrow()
  expect(calls.confirmBootstrapRegistry).not.toHaveBeenCalled()
  expect(calls.verifyBootstrapConsumer).not.toHaveBeenCalled()
  expect(existsSync(h.outputDirectory)).toBe(false)
  expectNoPublication(h)
})

it('preserves both the source failure and a new registry confirmation failure without republishing', async () => {
  const h = await fixture()
  calls.confirmBootstrapRegistry.mockRejectedValue(new Error('Published integrity differs from the frozen artifact'))
  const report = await verifyBootstrapPublication(h.options)
  expect(report).toMatchObject({ status: 'failed', accepted: true, confirmed: false, error: 'Published integrity differs from the frozen artifact' })
  expect(calls.verifyBootstrapConsumer).not.toHaveBeenCalled()
  expect(await readFile(path.join(h.outputDirectory, 'source-publication-report.json'))).toEqual(h.original)
  expect(JSON.parse(await readFile(path.join(h.outputDirectory, 'bootstrap-report.json'), 'utf8'))).toMatchObject({ status: 'failed', verification: { sourceRunId: 123, runId: 999 } })
  expectNoPublication(h)
})

it('records consumer failure after confirmation while retaining the original acceptance evidence', async () => {
  const h = await fixture()
  calls.verifyBootstrapConsumer.mockRejectedValue(new Error('Fresh registry consumer cannot load the public entry'))
  const report = await verifyBootstrapPublication(h.options)
  expect(report).toMatchObject({ status: 'failed', accepted: true, confirmed: true, error: 'Fresh registry consumer cannot load the public entry' })
  expect(await readFile(path.join(h.outputDirectory, 'source-publication-report.json'))).toEqual(h.original)
  expectNoPublication(h)
})

it('refuses to overwrite evidence when the same recovery output directory is reused', async () => {
  const h = await fixture()
  await verifyBootstrapPublication(h.options)
  const report = await readFile(path.join(h.outputDirectory, 'bootstrap-report.json'))
  await expect(verifyBootstrapPublication(h.options)).rejects.toThrow()
  expect(await readFile(path.join(h.outputDirectory, 'source-publication-report.json'))).toEqual(h.original)
  expect(await readFile(path.join(h.outputDirectory, 'bootstrap-report.json'))).toEqual(report)
  expect(calls.confirmBootstrapRegistry).toHaveBeenCalledTimes(1)
  expect(calls.verifyBootstrapConsumer).toHaveBeenCalledTimes(1)
  expectNoPublication(h)
})

it('rejects dry-run recovery before reading artifacts or creating a report directory', async () => {
  const h = await fixture()
  await expect(verifyBootstrapPublication({ ...h.options, dryRun: true })).rejects.toThrow('cannot be a dry-run')
  expect(calls.bootstrapBundle).not.toHaveBeenCalled()
  expect(existsSync(h.outputDirectory)).toBe(false)
  expectNoPublication(h)
})
