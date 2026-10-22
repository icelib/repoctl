import type { PackedPackage } from '../../../src/commands/package-check/types'
import { expect, it } from 'vitest'
import { checkDependencyRanges } from '../../../src/commands/package-check/consumer/dependencies'

function packed(name: string, dependencies?: Record<string, string>): PackedPackage {
  return {
    bytes: new Uint8Array(),
    manifest: { name, version: '1.0.1-snapshot.nightly.test', ...(dependencies ? { dependencies } : {}) },
    result: { name, directory: `/fixture/${name}`, role: 'selected', status: 'passed', files: [], diagnostics: [], commands: [] },
  }
}

it('requires the exact planned workspace URL before local tarball overrides can mask a different locator', () => {
  const url = `https://pkg.pr.new/acme/repo/dependency@${'a'.repeat(40)}`
  const expected = new Map([['consumer', new Map([['dependencies.alias', { name: 'dependency', locator: url }]])]])
  const dependency = packed('dependency')
  const correct = packed('consumer', { alias: url })
  checkDependencyRanges(correct, [correct, dependency], [correct.result, dependency.result], expected)
  expect(correct.result.diagnostics).toEqual([])

  const incorrect = packed('consumer', { alias: url.replace('acme/repo', 'someone/else') })
  checkDependencyRanges(incorrect, [incorrect, dependency], [incorrect.result, dependency.result], expected)
  expect(incorrect.result.diagnostics).toContainEqual(expect.objectContaining({ code: 'WORKSPACE_DEPENDENCY_RANGE' }))

  const unplanned = packed('consumer', { dependency: url })
  checkDependencyRanges(unplanned, [unplanned, dependency], [unplanned.result, dependency.result])
  expect(unplanned.result.diagnostics).toContainEqual(expect.objectContaining({ code: 'WORKSPACE_DEPENDENCY_RANGE' }))

  const missing = packed('consumer', { alias: url })
  checkDependencyRanges(missing, [missing], [missing.result], expected)
  expect(missing.result.diagnostics).toContainEqual(expect.objectContaining({ code: 'WORKSPACE_DEPENDENCY_UNAVAILABLE' }))
})
