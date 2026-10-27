import type { PackedManifest } from '../../../src/commands/package-check/types'
import process from 'node:process'
import { describe, expect, it } from 'vitest'
import { consumerOptionalPeers } from '../../../src/commands/package-check/consumer/optional-peers'
import { consumerApplicability, consumerHost } from '../../../src/commands/package-check/consumer/platform'
import { consumerRuntimeClosure } from '../../../src/commands/package-check/consumer/runtime-closure'
import { consumerEntries } from '../../../src/commands/package-check/entries'

const foreign = { name: 'foreign', version: '1.0.0', os: [`!${process.platform}`] }
const host = { os: 'linux', cpu: 'arm64', libc: 'musl' }

describe('真实宿主平台适用性', () => {
  it.each([
    [{ os: ['linux'], cpu: ['arm64'], libc: ['musl'] }, true],
    [{ os: ['darwin', 'linux'], cpu: ['x64', 'arm64'], libc: ['!glibc'] }, true],
    [{ os: ['any', '!win32'] }, true],
    [{ os: ['any', '!linux'] }, false],
    [{ cpu: ['arm64', '!arm64'] }, false],
    [{ libc: ['glibc'] }, false],
    [{ libc: ['any', '!musl'] }, false],
  ] as const)('遵守正负约束 %j', (manifest, applicable) => {
    const result = consumerApplicability(manifest as unknown as PackedManifest, host)
    expect(result.status).toBe(applicable ? 'applicable' : 'not-applicable')
    expect(result.host).toEqual(host)
  })

  it('未知 libc 不得满足具体 libc，Node 的真实宿主不受 npm 环境覆盖', () => {
    expect(consumerApplicability({ libc: ['musl'] }, { os: 'linux', cpu: 'x64' })).toMatchObject({ status: 'not-applicable', reason: expect.stringContaining('unknown') })
    expect(consumerApplicability({ libc: ['!musl'] }, { os: 'linux', cpu: 'x64' }).status).toBe('applicable')
    expect(consumerHost()).toMatchObject({ os: process.platform, cpu: process.arch })
    expect(Object.isFrozen(consumerHost())).toBe(true)
  })

  it.each([{ os: 'linux' }, { cpu: [42] }, { libc: ['!'] }])('拒绝非法约束 %j', (manifest) => {
    expect(() => consumerApplicability(manifest as PackedManifest, host)).toThrow('invalid')
  })

  it.each(['dependencies', 'peerDependencies'])('拒绝 %s 的不兼容必需依赖', (field) => {
    const root = { name: 'root', [field]: { foreign: '^1' } }
    expect(() => consumerRuntimeClosure([root], [root, foreign])).toThrow('required dependency root>foreign')
  })

  it('过滤可选依赖与别名可选 peer，并且不执行其传递集成', () => {
    const root = { name: 'root', optionalDependencies: { foreign: '^1' }, peerDependencies: { adapter: 'npm:foreign@^1' }, peerDependenciesMeta: { adapter: { optional: true } } }
    const dependency = { ...foreign, peerDependencies: { provider: '^1' }, peerDependenciesMeta: { provider: { optional: true } } }
    const closure = consumerRuntimeClosure([root], [root, dependency])
    expect(closure.references).toEqual([])
    expect(consumerOptionalPeers(closure)).toEqual({})
  })

  it('可选依赖覆盖同名必需声明，可选子树的必需依赖不兼容时过滤整个子树', () => {
    const root = { name: 'root', dependencies: { optional: '^1' }, optionalDependencies: { optional: '^1' } }
    const optional = { name: 'optional', dependencies: { foreign: '^1' } }
    expect(consumerRuntimeClosure([root], [root, optional, foreign]).references).toEqual([])
    expect(() => consumerRuntimeClosure([{ name: 'required', dependencies: { optional: '^1' } }], [optional, foreign])).toThrow('foreign')
  })

  it('原生入口使用 CommonJS，既不 ESM import 也不伪造声明文件', () => {
    expect(consumerEntries({ name: 'native', type: 'module', exports: './binding.node' }, ['binding.node'])).toEqual([
      { subpath: '.', target: './binding.node', runtime: true, format: 'cjs', typecheck: false },
    ])
  })
})
