import { expect, it } from 'vitest'
import { sanitizePublishedManifestContent } from './published'

it('keeps source browser acceptance tooling out of generated workspaces', () => {
  const manifest = JSON.parse(sanitizePublishedManifestContent(JSON.stringify({
    scripts: { 'test:packaged-create': 'node scripts/smoke-packaged-create.mjs', 'test': 'vitest run' },
    devDependencies: { playwright: '^1.62.1', vitest: '~5.0.2' },
  })))
  expect(manifest.scripts['test:packaged-create']).toBeUndefined()
  expect(manifest.scripts.test).toBe('vitest run')
  expect(manifest.devDependencies).toEqual({ vitest: '~5.0.2' })
})

it('publishes an installable tooling entrypoint without source workspace dependencies', () => {
  const manifest = JSON.parse(sanitizePublishedManifestContent(JSON.stringify({
    devDependencies: {
      '@icebreakers/commitlint-config': 'workspace:*',
      '@icebreakers/eslint-config': 'workspace:*',
      '@icebreakers/monorepo': 'workspace:*',
      '@icebreakers/stylelint-config': 'workspace:*',
      'repoctl': 'workspace:*',
      'typescript': '^6.0.3',
    },
  })))
  expect(manifest.devDependencies).toEqual({ repoctl: 'latest', typescript: '^6.0.3' })
})
