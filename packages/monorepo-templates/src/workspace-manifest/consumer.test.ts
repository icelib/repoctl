import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
// Exercise the public manifest contract delivered to create-repoctl.
// eslint-disable-next-line antfu/no-import-dist
import { createWorkspaceManifest } from '../../dist/index.mjs'

describe('consumer workspace manifest', () => {
  it('keeps the generated script graph independent of present and future source tooling', async () => {
    const source = JSON.parse(await readFile(new URL('../../../../package.json', import.meta.url), 'utf8'))
    source.scripts['test:future-source-check'] = 'node scripts/future.mjs'
    const manifest = createWorkspaceManifest(source)

    expect(manifest.scripts).toMatchObject({
      'lint': 'turbo run lint',
      'test': 'vitest run --passWithNoTests && pnpm test:types',
      'test:dev': 'vitest --passWithNoTests',
    })
    for (const command of Object.values(manifest.scripts!)) {
      expect(command).not.toMatch(/(?:scripts|tooling|packages)\//)
      for (const match of command.matchAll(/(?:^|&&\s*)pnpm (?:run )?([\w:-]+)/g)) {
        if (!['change', 'version'].includes(match[1]!)) {
          expect(manifest.scripts).toHaveProperty(match[1]!)
        }
      }
    }
    expect(manifest.scripts).not.toHaveProperty('test:future-source-check')
    expect(manifest.scripts).not.toHaveProperty('test:packaged-doctor')
    expect(manifest.scripts).not.toHaveProperty('check:workflows')
    expect(manifest.scripts).not.toHaveProperty('check:no-tracked-build-artifacts')
    expect(Object.values(manifest.devDependencies!)).not.toContain('workspace:*')
  })

  it('uses the same immutable manifest policy for prepared assets and bootstrap overrides', () => {
    const source = {
      name: 'source',
      packageManager: 'pnpm@12.6.0',
      scripts: { lint: 'pnpm run tooling:build && turbo run lint' },
      devDependencies: { '@icebreakers/monorepo': 'workspace:*', '@icebreakers/eslint-config': 'workspace:*', 'typescript': '^6.0.3' },
    }
    const original = structuredClone(source)
    const prepared = createWorkspaceManifest(source)
    const generated = createWorkspaceManifest(prepared, { name: 'consumer', packageManager: 'pnpm@12.7.0' })

    expect(source).toEqual(original)
    expect(createWorkspaceManifest(prepared)).toEqual(prepared)
    expect(generated).toMatchObject({
      name: 'consumer',
      packageManager: 'pnpm@12.7.0',
      devDependencies: { '@icebreakers/eslint-config': 'latest', 'typescript': '^6.0.3', 'repoctl': 'latest' },
    })
    expect(generated.devDependencies).not.toHaveProperty('@icebreakers/monorepo')
    expect(generated.scripts).toEqual(prepared.scripts)
    generated.scripts!['lint'] = 'changed'
    expect(prepared.scripts!['lint']).toBe('turbo run lint')
  })
})
