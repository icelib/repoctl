import type { ReleaseOptions } from '../types'

// A private in-process capability; CLI/env input cannot manufacture verification.
const verified = Symbol('repoctl verified stage')
type VerifiedOptions = ReleaseOptions & { [verified]?: true }

export function authorizeVerification<T extends ReleaseOptions>(options: T): T {
  return { ...options, [verified]: true }
}

export function hasVerification(options: ReleaseOptions) {
  return (options as VerifiedOptions)[verified] === true
}
