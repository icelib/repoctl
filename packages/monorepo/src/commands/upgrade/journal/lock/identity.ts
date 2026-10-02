import type { LockDirectoryIdentity } from './pending'

export function hasSameLockIdentity(info: LockDirectoryIdentity, expected: LockDirectoryIdentity) {
  return info.dev !== 0 && info.ino !== 0 && info.dev === expected.dev && info.ino === expected.ino
}
