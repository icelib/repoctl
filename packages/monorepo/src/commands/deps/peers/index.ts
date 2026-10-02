import type { PeerCompatibilityCheck, PeerCompatibilityReport, PeerWorkspacePackage } from './types'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { parse } from 'yaml'
import { clearWorkspaceCache, getWorkspaceData } from '../../../core/workspace'
import { record } from '../files'
import { comparePeer } from './check'
import { readPeerLockfile } from './lockfile'
import { resolvePeerSpecifier } from './specifier'

export type { PeerCheckStatus, PeerCompatibilityCheck, PeerCompatibilityReport } from './types'

/** Compare explicit devDependencies with peer promises, without installs or writes. */
export async function checkPeerDependencies(cwd: string): Promise<PeerCompatibilityReport> {
  clearWorkspaceCache()
  const { workspaceDir, packages } = await getWorkspaceData(cwd, { ignorePrivatePackage: false, ignoreRootPackage: false })
  const workspace = record(parse(await readFile(path.join(workspaceDir, 'pnpm-workspace.yaml'), 'utf8'))) ?? {}
  const lockfile = await readPeerLockfile(workspaceDir)
  const targets: PeerWorkspacePackage[] = packages.map(pkg => ({ name: pkg.manifest.name ?? null, directory: path.resolve(pkg.rootDir), version: pkg.manifest.version ?? null }))
  const report: PeerCompatibilityReport = {
    schemaVersion: 1,
    workspaceDir,
    pnpmPolicy: Object.fromEntries(['autoInstallPeers', 'strictPeerDependencies', 'resolvePeersFromWorkspaceRoot', 'peerDependencyRules'].filter(key => workspace[key] !== undefined).map(key => [key, workspace[key]])),
    checks: [],
    summary: { pass: 0, fail: 0, unknown: 0, skipped: 0 },
  }
  for (const pkg of packages.toSorted((a, b) => a.rootDir.localeCompare(b.rootDir))) {
    const manifest = record(pkg.manifest)!
    const peers = record(manifest['peerDependencies'])
    const dev = record(manifest['devDependencies'])
    if ((manifest['peerDependencies'] !== undefined && !peers) || (manifest['devDependencies'] !== undefined && !dev)) {
      throw new Error(`Invalid peer/development dependency map: ${pkg.rootDir}`)
    }
    const metadata = record(manifest['peerDependenciesMeta'])
    for (const [name, value] of Object.entries(peers ?? {}).sort(([a], [b]) => a.localeCompare(b))) {
      const testValue = dev?.[name]
      if (typeof value !== 'string' || (testValue !== undefined && typeof testValue !== 'string')) {
        throw new Error(`Invalid peer/development specifier: ${pkg.rootDir} ${name}`)
      }
      const peer = resolvePeerSpecifier(name, value, pkg.rootDir, targets, workspace)
      const test = typeof testValue === 'string' ? resolvePeerSpecifier(name, testValue, pkg.rootDir, targets, workspace) : null
      const check: PeerCompatibilityCheck = {
        packageName: pkg.manifest.name ?? null,
        path: path.relative(workspaceDir, pkg.rootDir).replaceAll('\\', '/') || '.',
        peer: name,
        optional: record(metadata?.[name])?.['optional'] === true,
        peerSpecifier: value,
        testSpecifier: typeof testValue === 'string' ? testValue : null,
        peerRange: peer.range,
        testRange: test?.range ?? null,
        testVersion: null,
        evidence: 'none',
        status: 'unknown',
        code: 'unresolved_peer',
        detail: '',
      }
      comparePeer(check, peer, test, lockfile)
      report.checks.push(check)
      report.summary[check.status]++
    }
  }
  return report
}
