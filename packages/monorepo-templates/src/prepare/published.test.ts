import { expect, it } from 'vitest'
import { sanitizePublishedManifestContent } from './published'

it('keeps source acceptance tooling out of generated workspaces', () => {
  const manifest = JSON.parse(sanitizePublishedManifestContent(JSON.stringify({
    scripts: {
      'test:packaged-create': 'node scripts/smoke-packaged-create.mjs',
      'test:packaged-doctor': 'node scripts/smoke-packaged-doctor.mjs',
      'test:packaged-react': 'node scripts/react/index.mjs',
      'test:packaged-next': 'node scripts/next/index.mjs',
      'test': 'vitest run',
    },
    devDependencies: { 'make-fetch-happen': '15.0.6', 'playwright': '^1.62.1', 'vitest': '~5.0.2' },
  })))
  expect(manifest.scripts['test:packaged-create']).toBeUndefined()
  expect(manifest.scripts['test:packaged-doctor']).toBeUndefined()
  expect(manifest.scripts['test:packaged-react']).toBeUndefined()
  expect(manifest.scripts['test:packaged-next']).toBeUndefined()
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

it('removes the source tooling build prerequisite from generated lint scripts', () => {
  const content = sanitizePublishedManifestContent(JSON.stringify({
    scripts: {
      'tooling:build': 'turbo run build --filter=@icebreakers/monorepo --filter=repoctl',
      'lint': 'pnpm run tooling:build && turbo run lint',
      'validate': 'pnpm run build && pnpm run lint && pnpm run typecheck',
    },
  }))
  expect(JSON.parse(content).scripts).toEqual({
    dev: 'turbo run dev --concurrency=20',
    lint: 'turbo run lint',
    validate: 'pnpm run build && pnpm run lint && pnpm run typecheck',
  })
  expect(sanitizePublishedManifestContent(content)).toBe(content)
})

it('keeps generated tests runnable without source repository check scripts', () => {
  const content = sanitizePublishedManifestContent(JSON.stringify({
    scripts: {
      'check:no-tracked-build-artifacts': 'node ./scripts/check-no-tracked-build-artifacts.mjs',
      'check:workflows': 'node ./scripts/check-workflows.mjs',
      'test:dev-scenarios': 'vitest run --config scripts/dev/vitest.config.mjs',
      'test': 'pnpm check:no-tracked-build-artifacts && vitest run && pnpm test:types && pnpm test:dev-scenarios',
      'test:dev': 'pnpm check:no-tracked-build-artifacts && vitest',
      'test:types': 'turbo run test:types',
    },
  }))
  expect(JSON.parse(content).scripts).toEqual({
    'dev': 'turbo run dev --concurrency=20',
    'test': 'vitest run && pnpm test:types',
    'test:dev': 'vitest',
    'test:types': 'turbo run test:types',
  })
  expect(sanitizePublishedManifestContent(content)).toBe(content)
})
