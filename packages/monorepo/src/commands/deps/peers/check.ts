import type { PeerCompatibilityCheck, PeerSpecifier } from './types'
import { satisfies, subset, valid } from 'semver'
import { rangesOverlap } from '../specifiers'
import { lockedPeerVersion } from './lockfile'

export function comparePeer(check: PeerCompatibilityCheck, peer: PeerSpecifier, test: PeerSpecifier | null, lock: Parameters<typeof lockedPeerVersion>[0]) {
  const finish = (status: PeerCompatibilityCheck['status'], code: PeerCompatibilityCheck['code'], detail: string) => Object.assign(check, { status, code, detail })
  if (!peer.source || !peer.range) {
    return finish('unknown', 'unresolved_peer', 'The peer declaration cannot be resolved to a package and semver range.')
  }
  if (peer.workspaceMismatch || test?.workspaceMismatch) {
    return finish('fail', 'workspace_range_mismatch', 'A workspace dependency range excludes the target package version; release protocol requirements are checked separately.')
  }
  if (!test) {
    return check.optional ? finish('skipped', 'optional_peer_missing', 'Optional peer has no explicit development/test dependency.') : finish('fail', 'missing_test_dependency', 'A required peer has no devDependencies declaration for testing.')
  }
  if (!test.source || !test.range) {
    return finish('unknown', 'unresolved_test_dependency', 'The development/test dependency cannot be resolved; it is not treated as compatible.')
  }
  if (peer.source !== test.source) {
    return finish('fail', 'different_package_source', 'The peer and development aliases refer to different packages.')
  }
  if (rangesOverlap([test.range, peer.range]) === false) {
    check.evidence = 'declared_range'
    return finish('fail', 'incompatible_test_range', 'The declared test and peer ranges have no shared compatible version.')
  }
  let version = test.version
  if (version) {
    check.evidence = 'workspace_version'
  }
  else {
    const result = lockedPeerVersion(lock, check.path, check.peer, [check.testSpecifier!, test.effective], test.source, test.range)
    if (result.state === 'stale') {
      return finish('unknown', 'stale_lockfile', 'The lockfile does not agree with the test declaration; no locked version is trusted.')
    }
    if (result.state === 'unsupported') {
      return finish('unknown', 'unsupported_lockfile', 'The lockfile or locked dependency format cannot be interpreted reliably.')
    }
    if (result.state === 'observed') {
      version = result.version!
      check.evidence = 'lockfile_version'
    }
  }
  if (!version && valid(test.range)) {
    version = valid(test.range)
    check.evidence = 'declared_version'
  }
  if (version) {
    check.testVersion = version
    return satisfies(version, peer.range)
      ? finish('pass', 'compatible', 'The test version from the reported evidence satisfies the peer range; one version does not prove the full support range or installed state.')
      : finish('fail', 'incompatible_test_version', 'The test version from the reported evidence is outside the promised peer range.')
  }
  check.evidence = 'declared_range'
  if (subset(test.range, peer.range)) {
    return finish('pass', 'compatible', 'The declared test range is contained in the peer range; installed versions and full-range compatibility are not verified.')
  }
  const overlap = rangesOverlap([test.range, peer.range])
  return overlap === false
    ? finish('fail', 'incompatible_test_range', 'The declared test and peer ranges have no shared compatible version.')
    : finish('unknown', 'partial_range_overlap', 'The test range is not fully contained in the peer range; pin or lock the version to establish compatibility.')
}
