import type { PackedManifest } from '../../../../src/commands/package-check/types'
import type { BootstrapManifest, BootstrapOptions, BootstrapReport } from '../../../../src/commands/release/bootstrap/types'
import type { SnapshotArchiveEntry } from '../../../../src/commands/release/snapshot/archive'
import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { writeSnapshotArchive } from '../../../../src/commands/release/snapshot/archive'

export interface BoundaryPackedManifest extends PackedManifest {
  private?: boolean
  publishConfig: Record<string, unknown>
}

export function integrity(bytes: Uint8Array) {
  return `sha512-${createHash('sha512').update(bytes).digest('base64')}`
}

export function packBoundary(packedManifest: PackedManifest, extra: SnapshotArchiveEntry[] = [], entrySource = 'throw new Error("Validation must not execute candidate entries")') {
  return writeSnapshotArchive([
    { path: 'package/package.json', mode: 0o644, type: 'File', data: Buffer.from(JSON.stringify(packedManifest)) },
    { path: 'package/index.js', mode: 0o644, type: 'File', data: Buffer.from(entrySource) },
    { path: 'package/index.d.ts', mode: 0o644, type: 'File', data: Buffer.from('export declare const value: string\n') },
    ...extra,
  ])
}

export function boundaryFixture() {
  const packedManifest: BoundaryPackedManifest = {
    name: '@acme/preview',
    version: '0.1.0-alpha.0',
    type: 'module',
    exports: { '.': { types: './index.d.ts', import: './index.js' } },
    publishConfig: { registry: 'https://registry.npmjs.org/', tag: 'alpha', access: 'public' },
  }
  const bytes = packBoundary(packedManifest)
  const files = ['index.d.ts', 'index.js', 'package.json']
  const manifest: BootstrapManifest = {
    schemaVersion: 1,
    source: {
      repository: 'acme/repo',
      repositoryId: 12,
      branch: 'main',
      commit: 'a'.repeat(40),
      runId: 123,
      runAttempt: 2,
      workflowRef: 'acme/repo/.github/workflows/release.yml@refs/heads/main',
    },
    package: { name: packedManifest.name!, directory: 'modules/preview', currentVersion: '0.1.0', version: packedManifest.version!, tarball: 'tarballs/package.tgz', integrity: integrity(bytes), files },
    registry: 'https://registry.npmjs.org/',
    tag: 'alpha',
    pnpmVersion: '12.14.0',
    buildDirectories: ['modules/shared', 'modules/preview'],
    protectedTags: ['latest', 'legacy-1'],
    packedManifest,
    entries: [{ subpath: '.', target: './index.js', format: 'esm', runtime: true }],
    checks: { build: 'passed', package: { name: packedManifest.name!, directory: 'modules/preview', role: 'selected', status: 'passed', files: [...files], diagnostics: [], commands: [] } },
  }
  const options: BootstrapOptions = { cwd: import.meta.dirname, packageName: manifest.package.name, version: manifest.package.version }
  const report: BootstrapReport = {
    schemaVersion: 1,
    status: 'failed',
    plan: manifest,
    manifest,
    accepted: true,
    confirmed: false,
    baselineTags: { 'latest': '0.1.0', 'legacy-1': '0.0.9' },
    error: 'Original registry confirmation did not complete',
  }
  return { manifest, packedManifest, bytes, options, report }
}

export function bootstrapStatement(manifest: BootstrapManifest) {
  const repository = `https://github.com/${manifest.source.repository}`
  return {
    _type: 'https://in-toto.io/Statement/v1',
    subject: [{ name: `pkg:npm/${manifest.package.name.replace(/^@/u, '%40')}@${manifest.package.version}`, digest: { sha512: Buffer.from(manifest.package.integrity.slice('sha512-'.length), 'base64').toString('hex') } }],
    predicateType: 'https://slsa.dev/provenance/v1',
    predicate: {
      buildDefinition: {
        buildType: 'https://slsa-framework.github.io/github-actions-buildtypes/workflow/v1',
        externalParameters: { workflow: { ref: `refs/heads/${manifest.source.branch}`, repository, path: '.github/workflows/release.yml' } },
        internalParameters: { github: { repository_id: String(manifest.source.repositoryId), event_name: 'workflow_dispatch' } },
        resolvedDependencies: [{ uri: `git+${repository}@refs/heads/${manifest.source.branch}`, digest: { gitCommit: manifest.source.commit } }],
      },
      runDetails: { metadata: { invocationId: `${repository}/actions/runs/${manifest.source.runId}/attempts/${manifest.source.runAttempt}` } },
    },
  }
}

export function attestationBody(statement: ReturnType<typeof bootstrapStatement>) {
  return {
    attestations: [{
      predicateType: 'https://slsa.dev/provenance/v1',
      bundle: { dsseEnvelope: { payloadType: 'application/vnd.in-toto+json', payload: Buffer.from(JSON.stringify(statement)).toString('base64') } },
    }],
  }
}

export function jsonResponse(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } })
}

export function attestationUrl(manifest: BootstrapManifest) {
  return `https://registry.npmjs.org/-/npm/v1/attestations/${encodeURIComponent(manifest.package.name)}@${manifest.package.version}`
}
