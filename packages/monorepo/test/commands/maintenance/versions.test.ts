import { detectMaintenanceVersionChange } from '@icebreakers/monorepo'
import { describe, expect, it } from 'vitest'
import { lockfile } from './fixture'

describe('maintenance dependency detection', () => {
  it('selects the workspace document after pnpm package-manager metadata', () => {
    const manager = '---\nlockfileVersion: \'9.0\'\nimporters:\n  .:\n    configDependencies: {}\n    packageManagerDependencies:\n      pnpm:\n        version: 12.8.1\n---\n'
    expect(detectMaintenanceVersionChange(manager + lockfile('5.5.0'), manager + lockfile('5.6.0'))).toMatchObject({ status: 'changed', from: '5.5.0', to: '5.6.0' })
  })

  it('ignores unrelated resolutions, range edits and peer context changes', () => {
    expect(detectMaintenanceVersionChange(lockfile('5.6.0(eslint@10.0.0)'), lockfile('5.6.0(eslint@10.1.0(foo@1.0.0))', 'packages:\n  unrelated@2.0.0: {}\n'))).toMatchObject({ status: 'unchanged', from: '5.6.0', to: '5.6.0' })
    expect(detectMaintenanceVersionChange(lockfile('5.6.0').replace('specifier: 5.6.0', 'specifier: \'catalog:\''), lockfile('5.6.0'))).toMatchObject({ status: 'unchanged' })
  })

  it.each([
    lockfile('link:packages/repoctl'),
    lockfile('5.6.0(peer@1.0.0)extra'),
    lockfile('5.6.0').replace('\'9.0\'', '\'10.0\''),
    `${lockfile('5.6.0')}---\n${lockfile('5.7.0')}`,
    'lockfileVersion: [broken',
    'lockfileVersion: \'9.0\'\nimporters:\n  packages/app: {}\n',
  ])('blocks unsupported or ambiguous lockfile evidence', (source) => {
    expect(detectMaintenanceVersionChange(lockfile('5.5.0'), source).status).toBe('blocked')
  })
})
