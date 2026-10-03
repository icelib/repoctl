import { expect, it } from 'vitest'

const { maintenanceTemplateVersion } = await import(new URL('../../../../resources/maintenance/migration-lock.mjs', import.meta.url).href)
const lock = `lockfileVersion: '9.0'
importers:
  .:
    devDependencies:
      repoctl:
        specifier: 5.0.0
        version: 5.0.0(peer@1.0.0)
packages:
  '@icebreakers/monorepo-templates@99.0.0': {}
snapshots:
  repoctl@5.0.0(peer@1.0.0):
    dependencies:
      '@icebreakers/monorepo': 4.0.0
  '@icebreakers/monorepo@4.0.0':
    dependencies:
      '@icebreakers/monorepo-templates': 1.2.0
`
function parse(text: string) {
  return maintenanceTemplateVersion({ lock: text, toolVersion: '5.0.0', fail: (message: string) => {
    throw new Error(message)
  } })
}
it('uses the complete root dependency chain and ignores unrelated template versions', () => {
  expect(parse(lock)).toBe('1.2.0')
  expect(parse(`---\nlockfileVersion: '9.0'\nimporters:\n  .:\n    packageManagerDependencies:\n      pnpm:\n        specifier: 12.0.0\n        version: 12.0.0\n---\n${lock}`)).toBe('1.2.0')
})
it.each([
  lock.replace('\'@icebreakers/monorepo\': 4.0.0', '\'@icebreakers/monorepo\': 4.0.0\n      \'@icebreakers/monorepo\': 99.0.0'),
  lock.replace('\'@icebreakers/monorepo\': 4.0.0', '\'@icebreakers/monorepo\': *alias'),
  lock.replace('\'@icebreakers/monorepo\': 4.0.0', '\'@icebreakers/monorepo\': {version: 4.0.0}'),
  lock.replace('version: 5.0.0(peer@1.0.0)', 'version: 4.0.0'),
  lock.replace('\'@icebreakers/monorepo-templates\': 1.2.0', '\'other-package\': 1.2.0'),
  lock.replace('lockfileVersion: \'9.0\'', 'lockfileVersion: \'8.0\''),
  `${lock}\n---\n${lock}`,
])('rejects ambiguous or disconnected locked template evidence', (text) => {
  expect(() => parse(text)).toThrow('unambiguous locked repoctl template dependency chain')
})
