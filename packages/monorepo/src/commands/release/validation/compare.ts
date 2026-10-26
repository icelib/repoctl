import type { Buffer } from 'node:buffer'
import type { GitTree } from './git'
import type { ReleasePreparationValidationFile, ReleasePreparationValidationOptions, ReleasePreparationValidationReport } from './types'
import { createHash } from 'node:crypto'
import { readBlob } from './git'
import { sameContent } from './metadata'

export async function comparePreparation(base: GitTree, head: GitTree, original: Map<string, Buffer>, expected: Map<string, Buffer>, report: ReleasePreparationValidationReport, options: ReleasePreparationValidationOptions) {
  const paths = new Set([...base.keys(), ...head.keys(), ...expected.keys()])
  const files: ReleasePreparationValidationFile[] = []
  for (const filename of [...paths].sort()) {
    const before = base.get(filename)
    const after = head.get(filename)
    const nativeChange = !sameContent(filename, original.get(filename), expected.get(filename))
    const actualChange = before?.oid !== after?.oid || before?.mode !== after?.mode
    if (!nativeChange && !actualChange) {
      continue
    }
    if (nativeChange) {
      const expectedMode = expected.has(filename) ? before?.mode ?? '100644' : undefined
      const matches = after?.mode === expectedMode && sameContent(filename, after ? readBlob(after, options) : undefined, expected.get(filename))
      files.push({ path: filename, status: matches ? 'expected' : !actualChange ? 'missing' : 'mismatch', reason: matches ? 'Matches native pnpm version replay.' : 'Candidate differs from the native manifest, consumed intent, ledger or appended changelog.' })
      continue
    }
    const declaration = options.policy.generatedFiles?.find(file => file.path === filename)
    if (!declaration || (after && after.mode !== '100644') || (before && before.mode !== '100644')) {
      files.push({ path: filename, status: 'unexpected', reason: 'Changed file is not a native release output or an explicitly verified generated file.' })
      continue
    }
    const beforeBytes = before ? readBlob(before, options) : null
    const afterBytes = after ? readBlob(after, options) : null
    const verified = declaration.sha256 !== undefined
      ? afterBytes !== null && createHash('sha256').update(afterBytes).digest('hex') === declaration.sha256.toLowerCase()
      : await declaration.validate({ path: filename, base: options.base, head: options.head, before: beforeBytes, after: afterBytes, packages: structuredClone(report.packages) }) === true
    files.push({ path: filename, status: verified ? 'custom-verified' : 'mismatch', reason: verified ? 'Verified by the trusted generated-file contract.' : 'Generated-file verification failed.' })
  }
  return files
}
