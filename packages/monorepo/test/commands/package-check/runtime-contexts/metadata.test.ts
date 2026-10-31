import type { PackedManifest } from '../../../../src/commands/package-check/types'
import { expect, it } from 'vitest'
import { consumerRuntimeContexts } from '../../../../src/commands/package-check/consumer/runtime-contexts'
import { consumerEntries } from '../../../../src/commands/package-check/entries'

const guard = { kind: 'expected-error', name: 'Error', message: 'Requires its build plugin.' }
const manifest: PackedManifest = {
  name: 'fixture-context',
  type: 'module',
  exports: { '.': './index.mjs', './setup': './setup.mjs' },
  peerDependencies: { vitest: '^5.0.5' },
  repoctl: { packageCheck: { runtimeContexts: { './setup': 'vitest' } } },
}
const files = ['index.mjs', 'setup.mjs']

it('keeps ordinary entries in Node and associates only exact ESM exports with their declared context', () => {
  expect(consumerRuntimeContexts({})).toEqual(new Map())
  expect(consumerEntries(manifest, files)).toEqual([
    { subpath: '.', target: './index.mjs', format: 'esm', runtime: true },
    { subpath: './setup', target: './setup.mjs', format: 'esm', runtime: true, context: 'vitest' },
  ])
  expect(consumerEntries({ ...manifest, repoctl: { packageCheck: { runtimeContexts: { '.': guard } } } }, files)[0]?.context).toEqual(guard)
})

it.each([
  null,
  [],
  '',
  true,
  1,
  { './*': 'vitest' },
  { './a/../setup': 'vitest' },
  { './a\\setup': 'vitest' },
  { './a//setup': 'vitest' },
  { './a/./setup': 'vitest' },
  { './': 'vitest' },
  { setup: 'vitest' },
  { './setup': 'node' },
  { './guard': { ...guard, message: '' } },
  { './guard': { ...guard, message: '  ' } },
  { './guard': { ...guard, message: 1 } },
  { './guard': { ...guard, skip: true } },
  { './guard': { ...guard, name: 'TypeError' } },
  { './guard': { kind: 'expected-error', message: 'guard' } },
])('rejects malformed runtimeContexts %j', (runtimeContexts) => {
  expect(() => consumerRuntimeContexts({ ...manifest, repoctl: { packageCheck: { runtimeContexts } } })).toThrow(/runtimeContexts/u)
})

it.each(['dependencies', 'optionalDependencies', 'peerDependencies'] as const)('accepts Vitest from published %s, but never solely from development dependencies', (field) => {
  const base = { ...manifest, devDependencies: { vitest: '^5.0.5' } }
  delete base.peerDependencies
  expect(() => consumerRuntimeContexts(base)).toThrow('declared Vitest dependency or peer')
  expect(consumerRuntimeContexts({ ...base, [field]: { vitest: '^5.0.5' } }).get('./setup')).toBe('vitest')
})

it.each([
  { exports: { '.': './index.mjs' } },
  { exports: { './setup': { types: './setup.d.mts' } } },
  { exports: { './setup': { browser: './setup.mjs' } } },
  { exports: { './setup': './setup.cjs' } },
  { exports: { './setup': { import: './setup.mjs', require: './setup.cjs' } } },
  { exports: { './setup': './missing.mjs' } },
  { exports: { './setup': '../setup.mjs' } },
  { exports: { './setup': './dist/../setup.mjs' } },
  { exports: { './setup': './dist\\setup.mjs' } },
])('rejects contexts without an unambiguous packed ESM target: %j', (changes) => {
  expect(() => consumerEntries({ ...manifest, ...changes }, [...files, 'setup.cjs', 'setup.d.mts'])).toThrow('packed ESM export')
})

it('rejects a runtime asset and execution context on the same subpath', () => {
  expect(() => consumerEntries({ ...manifest, repoctl: { packageCheck: { runtimeAssets: ['./setup'], runtimeContexts: { './setup': 'vitest' } } } }, files)).toThrow('runtime asset contract')
})
