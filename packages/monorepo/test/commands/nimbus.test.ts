import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { getTemplateKeys, scaffoldWorkspace, shouldSkipTemplatePath } from '@icebreakers/monorepo-templates'
import { describe, expect, it, vi } from 'vitest'
import { verifyStagedTypecheck } from '@/commands'

describe('Nimbus template delivery', () => {
  it('preserves template numbering and supports both documentation engines', () => {
    expect(getTemplateKeys()).toEqual(['tsdown', 'vue-lib', 'vue-hono', 'hono-server', 'vitepress', 'cli', 'nimbus'])
    expect(getTemplateKeys({ category: 'docs' })).toEqual(['vitepress', 'nimbus'])
  })

  it('copies both document templates into distinct workspaces without caches', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'repoctl-both-docs-'))
    try {
      await scaffoldWorkspace({ targetDir: root, templateKeys: ['nimbus', 'vitepress'], includeAssets: false })
      const pkg = JSON.parse(await readFile(path.join(root, 'apps/docs/package.json'), 'utf8'))
      const template = JSON.parse(await readFile(new URL('../../../../templates/nimbus/package.json', import.meta.url), 'utf8'))
      expect(pkg.dependencies).toEqual(template.dependencies)
      expect(await readFile(path.join(root, 'apps/website/package.json'), 'utf8')).toContain('vitepress')
      const files = await readdir(path.join(root, 'apps/docs'))
      for (const generated of ['.astro', '.nimbus', 'node_modules', 'dist', 'pnpm-lock.yaml', 'pnpm-workspace.yaml']) {
        expect(files).not.toContain(generated)
      }
    }
    finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('filters Astro and Nimbus scratch data without filtering authored files', () => {
    const root = '/repo/templates/nimbus'
    for (const file of ['.astro/types.d.ts', '.nimbus/prepared.json', 'dist/index.html']) {
      expect(shouldSkipTemplatePath(root, `${root}/${file}`)).toBe(true)
    }
    expect(shouldSkipTemplatePath(root, `${root}/src/pages/llms.txt.ts`)).toBe(false)
    expect(shouldSkipTemplatePath(root, `${root}/nimbus.json`)).toBe(false)
  })

  it('routes Astro and MDX changes to one workspace typecheck', () => {
    const root = path.resolve(import.meta.dirname, '../../../..')
    const spawn = vi.fn(() => ({ status: 0 }))
    verifyStagedTypecheck(['templates/nimbus/src/pages/index.astro', 'templates/nimbus/src/content/docs/index.mdx'], {
      cwd: root,
      spawn: spawn as unknown as typeof import('node:child_process').spawnSync,
    })
    expect(spawn).toHaveBeenCalledExactlyOnceWith('pnpm', ['--dir', path.join(root, 'templates/nimbus'), 'typecheck'], expect.objectContaining({ cwd: root }))
  })
})
