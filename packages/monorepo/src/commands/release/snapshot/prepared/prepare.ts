import type { PreparedSnapshot, PreparedSnapshotManifest, PrepareSnapshotOptions } from './types'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { createSnapshotPlan } from '../plan'
import { prepareNightlySnapshot } from '../prepare'
import { createSnapshotBuildPlan } from './plan'
import { canonicalSnapshotJson, snapshotPlanDigest, validateSnapshotBuildPlan } from './schema'
import { validatePreparedSnapshot } from './validate'

/** Build on an unprivileged runner; emit a portable bundle separate from retained diagnostics. */
export async function prepareSnapshot(options: PrepareSnapshotOptions): Promise<PreparedSnapshot> {
  if ('referenceGitlinks' in options || 'prepareSource' in options) {
    throw new Error('Prepared snapshots do not accept source preparation extensions outside the frozen plan.')
  }
  const env = options.env ?? process.env
  if (['ACTIONS_ID_TOKEN_REQUEST_TOKEN', 'NODE_AUTH_TOKEN', 'NPM_TOKEN'].some(key => env[key])) {
    throw new Error('Snapshot preparation must run without OIDC or npm publishing credentials.')
  }
  const plan = validateSnapshotBuildPlan(options.plan)
  const actual = await createSnapshotBuildPlan({ ...options, source: plan.source })
  if (canonicalSnapshotJson(actual) !== canonicalSnapshotJson(plan)) {
    throw new Error('Snapshot candidate source does not match the trusted frozen plan.')
  }
  const snapshotOptions = { ...options, identity: plan.identity, registry: plan.registry }
  const report = await createSnapshotPlan(snapshotOptions)
  await prepareNightlySnapshot(report, snapshotOptions, { provider: 'npm', repository: plan.source.repository })
  const directory = path.join(report.outputDirectory!, 'prepared')
  await mkdir(directory)
  const files = new Map<string, Uint8Array>()
  const packages: PreparedSnapshotManifest['packages'] = []
  for (const [index, pkg] of report.packages.entries()) {
    const tarball = `tarballs/${index}/package.tgz`
    const bytes = await readFile(pkg.tarball!)
    files.set(tarball, bytes)
    await mkdir(path.dirname(path.join(directory, tarball)), { recursive: true })
    await writeFile(path.join(directory, tarball), bytes)
    packages.push({ name: pkg.name, version: pkg.version, tarball, integrity: pkg.integrity! })
  }
  const manifest: PreparedSnapshotManifest = {
    schemaVersion: 1,
    plan,
    planDigest: snapshotPlanDigest(plan),
    packages,
    checks: { build: 'passed', packages: report.checks!.map(check => ({ name: check.name, status: 'passed', files: check.files })) },
  }
  const encoded = new TextEncoder().encode(`${JSON.stringify(manifest, null, 2)}\n`)
  files.set('snapshot-manifest.json', encoded)
  await validatePreparedSnapshot(manifest, plan, files)
  await writeFile(path.join(directory, 'snapshot-manifest.json'), encoded)
  return { manifest, directory }
}
