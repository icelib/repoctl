export type PeerCheckStatus = 'pass' | 'fail' | 'unknown' | 'skipped'

export interface PeerCompatibilityCheck {
  packageName: string | null
  path: string
  peer: string
  optional: boolean
  peerSpecifier: string
  testSpecifier: string | null
  peerRange: string | null
  testRange: string | null
  testVersion: string | null
  evidence: 'none' | 'declared_range' | 'declared_version' | 'lockfile_version' | 'workspace_version'
  status: PeerCheckStatus
  code: 'compatible' | 'optional_peer_missing' | 'missing_test_dependency' | 'unresolved_peer' | 'unresolved_test_dependency' | 'workspace_range_mismatch' | 'different_package_source' | 'incompatible_test_version' | 'incompatible_test_range' | 'partial_range_overlap' | 'stale_lockfile' | 'unsupported_lockfile'
  detail: string
}

export interface PeerCompatibilityReport {
  schemaVersion: 1
  workspaceDir: string
  /** These pnpm policies are reported, not changed or substituted by this static check. */
  pnpmPolicy: Record<string, unknown>
  checks: PeerCompatibilityCheck[]
  summary: Record<PeerCheckStatus, number>
}

export interface PeerWorkspacePackage {
  name: string | null
  directory: string
  version: string | null
}

export interface PeerSpecifier {
  source: string | null
  range: string | null
  version: string | null
  effective: string
  workspaceMismatch: boolean
}
