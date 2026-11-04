import { expect, it, vi } from 'vitest'
import { verifyBootstrapProvenance } from '../../../../src/commands/release/bootstrap/provenance'
import { attestationBody, attestationUrl, bootstrapStatement, boundaryFixture, jsonResponse } from './boundary-fixture'

type Statement = ReturnType<typeof bootstrapStatement>

it('binds registry provenance to the exact package, tarball, release workflow, source commit and upload attempt', async () => {
  const h = boundaryFixture()
  const url = attestationUrl(h.manifest)
  const fetcher = vi.fn(async () => jsonResponse(attestationBody(bootstrapStatement(h.manifest))))
  await expect(verifyBootstrapProvenance(h.manifest, url, { ...h.options, registryFetch: fetcher })).resolves.toBeUndefined()
  expect(fetcher).toHaveBeenCalledWith(new URL(url), expect.objectContaining({ redirect: 'error' }))
})

const substitutions: Array<{ label: string, change: (statement: Statement) => void }> = [
  { label: 'another workflow', change: statement => statement.predicate.buildDefinition.externalParameters.workflow.path = '.github/workflows/preview.yml' },
  { label: 'another repository', change: statement => statement.predicate.buildDefinition.externalParameters.workflow.repository = 'https://github.com/acme/other' },
  { label: 'another branch', change: statement => statement.predicate.buildDefinition.externalParameters.workflow.ref = 'refs/heads/feature' },
  { label: 'another repository ID', change: statement => statement.predicate.buildDefinition.internalParameters.github.repository_id = '99' },
  { label: 'another trigger', change: statement => statement.predicate.buildDefinition.internalParameters.github.event_name = 'workflow_run' },
  { label: 'another commit', change: statement => statement.predicate.buildDefinition.resolvedDependencies[0]!.digest.gitCommit = 'b'.repeat(40) },
  { label: 'another source URI', change: statement => statement.predicate.buildDefinition.resolvedDependencies[0]!.uri = 'git+https://github.com/acme/other@refs/heads/main' },
  { label: 'another run', change: statement => statement.predicate.runDetails.metadata.invocationId = 'https://github.com/acme/repo/actions/runs/124/attempts/2' },
  { label: 'another attempt', change: statement => statement.predicate.runDetails.metadata.invocationId = 'https://github.com/acme/repo/actions/runs/123/attempts/3' },
  { label: 'another package', change: statement => statement.subject[0]!.name = 'pkg:npm/%40acme/other@0.1.0-alpha.0' },
  { label: 'another tarball', change: statement => statement.subject[0]!.digest.sha512 = '0'.repeat(128) },
]

it.each(substitutions)('rejects a valid-shaped publication attestation from $label', async ({ change }) => {
  const h = boundaryFixture()
  const statement = bootstrapStatement(h.manifest)
  change(statement)
  const fetcher = vi.fn(async () => jsonResponse(attestationBody(statement)))
  await expect(verifyBootstrapProvenance(h.manifest, attestationUrl(h.manifest), { ...h.options, registryFetch: fetcher })).rejects.toThrow()
})

it('rejects ambiguous provenance instead of selecting whichever publication matches', async () => {
  const h = boundaryFixture()
  const body = attestationBody(bootstrapStatement(h.manifest))
  body.attestations.push(structuredClone(body.attestations[0]!))
  const fetcher = vi.fn(async () => jsonResponse(body))
  await expect(verifyBootstrapProvenance(h.manifest, attestationUrl(h.manifest), { ...h.options, registryFetch: fetcher })).rejects.toThrow('one SLSA v1')
})

it.each([
  'https://example.invalid/-/npm/v1/attestations/preview',
  'https://registry.npmjs.org/unrelated/preview',
  'https://registry.npmjs.org/-/npm/v1/attestations/preview#fragment',
  'https://user:password@registry.npmjs.org/-/npm/v1/attestations/preview',
])('rejects an unsafe provenance endpoint before requesting it: %s', async (url) => {
  const h = boundaryFixture()
  const fetcher = vi.fn()
  await expect(verifyBootstrapProvenance(h.manifest, url, { ...h.options, registryFetch: fetcher })).rejects.toThrow()
  expect(fetcher).not.toHaveBeenCalled()
})

it('retains a registry provenance outage as a verification failure', async () => {
  const h = boundaryFixture()
  const fetcher = vi.fn(async () => jsonResponse({ error: 'Unavailable' }, 503))
  await expect(verifyBootstrapProvenance(h.manifest, attestationUrl(h.manifest), { ...h.options, registryFetch: fetcher })).rejects.toThrow('HTTP 503')
})
