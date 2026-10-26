import type { ReleasePreparationPolicy } from './types'
import { resolveReleaseBranches } from '../lines/config'
import { safePath } from './git'

export function nativeFile(filename: string) {
  return /(?:^|\/)package\.json$/.test(filename) || /(?:^|\/)CHANGELOG\.md$/i.test(filename)
    || filename.startsWith('.changeset/') || ['pnpm-workspace.yaml', 'pnpm-lock.yaml'].includes(filename)
}

export function validatePolicy(value: unknown): asserts value is ReleasePreparationPolicy {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('A trusted release validation policy is required.')
  }
  const policy = value as ReleasePreparationPolicy
  if (Object.keys(policy).some(key => !['branch', 'branches', 'generatedFiles'].includes(key))
    || typeof policy.branch !== 'string' || !resolveReleaseBranches(policy.branches).some(rule => rule.branch === policy.branch)) {
    throw new Error('Policy must select a configured release target branch.')
  }
  if (policy.generatedFiles !== undefined && !Array.isArray(policy.generatedFiles)) {
    throw new Error('generatedFiles must contain exact paths and trusted verifiers.')
  }
  const seen = new Set<string>()
  for (const file of policy.generatedFiles ?? []) {
    if (!file || typeof file !== 'object' || typeof file.path !== 'string' || !safePath(file.path)
      || nativeFile(file.path) || seen.has(file.path)
      || Object.keys(file).some(key => !['path', 'sha256', 'validate'].includes(key))) {
      throw new Error('Generated-file declarations must be unique safe paths outside native release metadata.')
    }
    seen.add(file.path)
    const digest = typeof file.sha256 === 'string' && /^[a-f\d]{64}$/i.test(file.sha256)
    const callback = typeof file.validate === 'function'
    if ((!digest && !callback) || (file.sha256 !== undefined && file.validate !== undefined)) {
      throw new Error(`Generated file requires one SHA-256 digest or trusted callback: ${file.path}`)
    }
  }
}
