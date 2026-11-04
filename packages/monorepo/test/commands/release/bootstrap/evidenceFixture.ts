import type { BootstrapManifest, BootstrapOptions, BootstrapReport } from '@/commands/release/bootstrap/types'
import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { consumerEntries } from '@/commands/package-check/entries'
import { bootstrapIntegrity } from '@/commands/release/bootstrap/schema'
import { writeSnapshotArchive } from '@/commands/release/snapshot/archive'
import { zip } from '../snapshot/prepared/github/fixture'

export function evidenceFixture(kind: 'prepared' | 'publication' = 'prepared') {
  const source = { repository: 'acme/repo', repositoryId: 12, commit: 'a'.repeat(40), branch: 'main', runId: 123, runAttempt: 2, workflowRef: 'acme/repo/.github/workflows/release.yml@refs/heads/main' }
  const packedManifest = { name: '@scope/new', version: '1.0.0-alpha.0', type: 'module', exports: './index.js', publishConfig: { registry: 'https://registry.npmjs.org/', tag: 'alpha', access: 'public' } }
  const tarball = writeSnapshotArchive([
    { path: 'package/package.json', mode: 0o644, type: 'File', data: Buffer.from(JSON.stringify(packedManifest)) },
    { path: 'package/index.js', mode: 0o644, type: 'File', data: Buffer.from('throw new Error("Candidate code must not run during evidence verification")') },
  ])
  const inventory = ['index.js', 'package.json']
  const manifest: BootstrapManifest = {
    schemaVersion: 1,
    source,
    package: { name: packedManifest.name, directory: 'packages/new', currentVersion: '0.0.0', version: packedManifest.version, tarball: 'tarballs/package.tgz', integrity: bootstrapIntegrity(tarball), files: inventory },
    registry: 'https://registry.npmjs.org/',
    tag: 'alpha',
    pnpmVersion: '12.14.0',
    buildDirectories: ['packages/new'],
    protectedTags: ['latest'],
    checks: { build: 'passed', package: { name: packedManifest.name, directory: 'packages/new', role: 'selected', status: 'passed', files: inventory, diagnostics: [], commands: [] } },
    entries: consumerEntries(packedManifest, inventory),
    packedManifest,
  }
  const sourceReport: BootstrapReport = { schemaVersion: 1, status: 'failed', plan: manifest, manifest, accepted: true, confirmed: false, baselineTags: { latest: '0.0.0-stage' }, error: 'Original registry confirmation timed out' }
  const files = new Map<string, Uint8Array>([
    ['bootstrap-manifest.json', Buffer.from(JSON.stringify(manifest))],
    [manifest.package.tarball, tarball],
  ])
  if (kind === 'publication') {
    files.set('bootstrap-report.json', Buffer.from(JSON.stringify(sourceReport)))
  }
  const repository = { id: source.repositoryId, full_name: source.repository, default_branch: 'main' }
  const run = { id: source.runId, run_attempt: source.runAttempt, path: '.github/workflows/release.yml', head_sha: source.commit, head_branch: source.branch, event: 'workflow_dispatch', status: 'completed', conclusion: kind === 'prepared' ? 'success' : 'failure', repository: { ...repository }, head_repository: { ...repository } }
  const jobs = [{ id: 501, name: kind === 'prepared' ? 'Prepare bootstrap package' : 'Publish bootstrap package', run_id: source.runId, run_attempt: source.runAttempt, status: 'completed', conclusion: kind === 'prepared' ? 'success' : 'failure' }]
  const artifact = { id: 1001, name: `repoctl-bootstrap${kind === 'publication' ? '-publication' : ''}-${source.runId}-${source.runAttempt}`, expired: false, digest: '', size_in_bytes: 0, workflow_run: { id: source.runId, repository_id: source.repositoryId, head_repository_id: source.repositoryId, head_sha: source.commit } }
  const listedArtifact = { ...artifact, workflow_run: { ...artifact.workflow_run } }
  const routes = new Map<string, unknown>([
    ['', repository],
    [`/actions/runs/${source.runId}`, run],
    [`/actions/runs/${source.runId}/attempts/${source.runAttempt}/jobs`, { jobs }],
    [`/actions/runs/${source.runId}/artifacts`, { artifacts: [listedArtifact] }],
    [`/actions/artifacts/${artifact.id}`, artifact],
  ])
  const downloads = new Map<string, Uint8Array>()
  function encodeManifest() {
    files.set('bootstrap-manifest.json', Buffer.from(JSON.stringify(manifest)))
  }
  function seal() {
    const bytes = zip(files)
    const digest = `sha256:${createHash('sha256').update(bytes).digest('hex')}`
    Object.assign(artifact, { digest, size_in_bytes: bytes.byteLength })
    Object.assign(listedArtifact, { digest, size_in_bytes: bytes.byteLength })
    downloads.set(`/actions/artifacts/${artifact.id}/zip`, bytes)
  }
  seal()
  const requests: Array<{ url: string, authorization: string | null }> = []
  const fetcher: typeof globalThis.fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input))
    requests.push({ url: url.href, authorization: new Headers(init?.headers).get('authorization') })
    if (url.hostname === 'storage.example') {
      const bytes = downloads.get(url.pathname)
      if (!bytes) {
        throw new Error(`Unexpected fixture download ${url.pathname}`)
      }
      return new Response(Uint8Array.from(bytes))
    }
    if (url.origin !== 'https://api.github.com') {
      throw new Error(`Unexpected non-GitHub request ${url.origin}`)
    }
    const route = url.pathname.replace(`/repos/${source.repository}`, '')
    if (downloads.has(route)) {
      return new Response(null, { status: 302, headers: { location: `https://storage.example${route}?signed=fixture-secret` } })
    }
    if (!routes.has(route)) {
      throw new Error(`Unexpected fixture GitHub request ${route}`)
    }
    return Response.json(routes.get(route))
  }
  const env: NodeJS.ProcessEnv = { GITHUB_ACTIONS: 'true', GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_REPOSITORY: source.repository, GITHUB_REF: 'refs/heads/main', GITHUB_WORKFLOW_REF: source.workflowRef, GITHUB_RUN_ID: kind === 'prepared' ? String(source.runId) : '999', GITHUB_RUN_ATTEMPT: kind === 'prepared' ? String(source.runAttempt) : '3', GITHUB_SHA: source.commit, GITHUB_TOKEN: 'fixture-github-token' }
  const options: BootstrapOptions = { cwd: '.', packageName: packedManifest.name, version: packedManifest.version, tag: 'alpha', env, fetch: fetcher, ...(kind === 'publication' ? { verifyRunId: source.runId } : {}) }
  return { options, env, manifest, tarball, files, sourceReport, repository, run, jobs, artifact, listedArtifact, routes, downloads, requests, encodeManifest, seal }
}
