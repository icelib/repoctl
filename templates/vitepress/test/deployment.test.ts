import type { TransformContext } from 'vitepress'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { getDocsDeployment, previewOrigin, stableOrigin } from '../.vitepress/deployment'
import { writeDeploymentFiles } from '../.vitepress/deployment/output'
import { createPageHead } from '../.vitepress/seo'

describe('documentation channels', () => {
  it('keeps legacy domain routing reachable without sharing production routes with preview', async () => {
    const file = fileURLToPath(new URL('../wrangler.jsonc', import.meta.url))
    const config = JSON.parse(await readFile(file, 'utf8'))
    expect(config.routes).toEqual([
      { pattern: 'repo.icebreaker.top', custom_domain: true },
      { pattern: 'repoctl.icebreaker.top', custom_domain: true },
    ])
    expect(config.env.next.routes).toEqual([{ pattern: 'next.repo.icebreaker.top', custom_domain: true }])
    expect(config.env.next.name).not.toBe(config.name)
  })

  it('defaults local builds to preview and rejects unknown channels', () => {
    expect(getDocsDeployment(undefined).preview).toBe(true)
    expect(getDocsDeployment('').preview).toBe(true)
    expect(() => getDocsDeployment('production')).toThrow('Unsupported documentation channel')
  })

  it.each(['preview', 'stable'] as const)('keeps canonical, social and crawler policy consistent for %s', async (channel) => {
    const deployment = getDocsDeployment(channel)
    const origin = channel === 'preview' ? previewOrigin : stableOrigin
    const head = createPageHead({ page: 'zh/tasks/docs.md', title: '文档', description: '文档' } as TransformContext, deployment)
    expect(head).toContainEqual(['link', { rel: 'canonical', href: `${origin}/zh/tasks/docs` }])
    expect(head).toContainEqual(['meta', { property: 'og:url', content: `${origin}/zh/tasks/docs` }])
    expect(head.find(([, attributes]) => attributes.name === 'robots')?.[1].content)
      .toBe(channel === 'preview' ? 'noindex, nofollow, noarchive' : undefined)

    const output = await mkdtemp(path.join(os.tmpdir(), 'repoctl-docs-channel-'))
    try {
      await writeDeploymentFiles(output, deployment)
      const robots = await readFile(path.join(output, 'robots.txt'), 'utf8')
      const headers = await readFile(path.join(output, '_headers'), 'utf8')
      if (channel === 'preview') {
        expect(robots).toBe('User-agent: *\nDisallow: /\n')
        expect(headers).toContain('X-Robots-Tag: noindex, nofollow, noarchive')
      }
      else {
        expect(robots).toContain(`Sitemap: ${stableOrigin}/sitemap.xml`)
        expect(robots).toContain('Allow: /')
        expect(headers).not.toContain('noindex')
      }
    }
    finally {
      await rm(output, { recursive: true, force: true })
    }
  })

  it('removes preview crawler headers when rebuilding the same output for stable', async () => {
    const output = await mkdtemp(path.join(os.tmpdir(), 'repoctl-docs-channel-'))
    try {
      await writeDeploymentFiles(output, getDocsDeployment('preview'))
      await writeDeploymentFiles(output, getDocsDeployment('stable'))
      expect(await readFile(path.join(output, '_headers'), 'utf8')).toBe('')
      expect(await readFile(path.join(output, 'robots.txt'), 'utf8')).not.toContain('Disallow: /\n')
    }
    finally {
      await rm(output, { recursive: true, force: true })
    }
  })
})
