import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { expect, it } from 'vitest'
import { arePublishedConfigAssetsPrepared, sanitizePublishedConfigContent } from './config'

it('omits source nightly policy and verification scripts while retaining consumer configuration', async () => {
  const source = await readFile(new URL('../../../../repoctl.config.ts', import.meta.url), 'utf8')
  const output = sanitizePublishedConfigContent(source)
  expect(source).toContain('schedule: \'17 19 * * *\'')
  expect(output).not.toContain('nightly:')
  expect(output).not.toContain('qualityScripts:')
  expect(output).not.toContain('check:workflows')
  expect(output).not.toContain('repoctl-source-only:')
  expect(output).toContain('afterPublish:')
  expect(output).toContain('defaultTemplate:')
  expect(sanitizePublishedConfigContent(output)).toBe(output)
})

it('preserves unmarked user configuration and rejects malformed source markers', () => {
  const content = 'export default {commands:{release:{nightly:{schedule:\'0 1 * * *\'}}}}\n'
  expect(sanitizePublishedConfigContent(content)).toBe(content)
  expect(() => sanitizePublishedConfigContent('// repoctl-source-only:start\nexport default {}\n')).toThrow('Unbalanced')
})

it('detects stale prepared configuration without writing it', async () => {
  const source = await mkdtemp(path.join(tmpdir(), 'repoctl-config-source-'))
  const assets = await mkdtemp(path.join(tmpdir(), 'repoctl-config-assets-'))
  try {
    await writeFile(path.join(source, 'repoctl.config.ts'), 'export default {}\n')
    expect(await arePublishedConfigAssetsPrepared(source, assets)).toBe(false)
    await writeFile(path.join(assets, 'repoctl.config.ts'), 'export default {}\n')
    expect(await arePublishedConfigAssetsPrepared(source, assets)).toBe(true)
    await writeFile(path.join(source, 'repoctl.config.ts'), 'export default {tooling:{}}\n')
    expect(await arePublishedConfigAssetsPrepared(source, assets)).toBe(false)
    expect(await readFile(path.join(assets, 'repoctl.config.ts'), 'utf8')).toBe('export default {}\n')
  }
  finally {
    await Promise.all([rm(source, { recursive: true, force: true }), rm(assets, { recursive: true, force: true })])
  }
})
