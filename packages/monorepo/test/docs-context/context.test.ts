import { docsRobots, resolveDocsContext } from '@icebreakers/monorepo/docs-context'
import { describe, expect, it } from 'vitest'

const origins = { previewOrigin: 'https://preview.example.com', stableOrigin: 'https://docs.example.com' }

describe('public documentation context', () => {
  it.each([undefined, '', 'preview'])('defaults %s to a credential-free preview', (channel) => {
    expect(resolveDocsContext({ ...origins, channel })).toEqual({
      channel: 'preview',
      preview: true,
      origin: origins.previewOrigin,
      stableOrigin: origins.stableOrigin,
    })
  })

  it('allows a local stable build and normalizes origins without requiring release state', () => {
    const context = resolveDocsContext({ ...origins, channel: 'stable', stableOrigin: 'https://DOCS.example.com:443/', url: 'https://docs.example.com/' })
    expect(context).toEqual({ channel: 'stable', preview: false, origin: origins.stableOrigin, stableOrigin: origins.stableOrigin })
    expect(docsRobots(context, `${context.origin}/guide/sitemap-index.xml`)).toContain(`Sitemap: ${context.origin}/guide/sitemap-index.xml`)
  })

  it('uses a separate channel origin and prevents environment drift', () => {
    expect(() => resolveDocsContext({ ...origins, channel: 'production' })).toThrow('Unsupported documentation channel')
    expect(() => resolveDocsContext({ ...origins, url: origins.stableOrigin })).toThrow('does not match')
    expect(() => resolveDocsContext({ ...origins, channel: 'stable', url: origins.previewOrigin })).toThrow('does not match')
    expect(() => resolveDocsContext({ ...origins, previewOrigin: `${origins.stableOrigin}/` })).toThrow('must be distinct')
    expect(resolveDocsContext({ ...origins, url: '' }).origin).toBe(origins.previewOrigin)
    expect(docsRobots(resolveDocsContext(origins))).toBe('User-agent: *\nDisallow: /\n')
  })

  it.each([null, false, 0])('does not silently default an invalid JavaScript channel %j', (channel) => {
    expect(() => resolveDocsContext({ ...origins, channel: channel as unknown as string })).toThrow('Unsupported documentation channel')
  })

  it.each(['', 'relative', '//docs.example.com', 'ftp://docs.example.com', 'https:docs.example.com', 'https://user:secret@example.com', 'https://example.com/docs', 'https://example.com/a/..', 'https://example.com/?', 'https://example.com/#', 'https://example.com?secret=value', 'https://example.com/#fragment', ' https://example.com', 'https://example.com\\'])('rejects malformed or pathful origin %s without echoing it', (value) => {
    for (const field of ['previewOrigin', 'stableOrigin', 'url']) {
      if (field === 'url' && value === '') {
        continue
      }
      expect(() => resolveDocsContext({ ...origins, [field]: value })).toThrow('must be an HTTP(S) origin')
    }
    expect(() => resolveDocsContext({ ...origins, url: value })).not.toThrow('secret')
  })

  it('supports HTTP for local origins and rejects unrelated sitemap origins', () => {
    const context = resolveDocsContext({ ...origins, channel: 'stable', stableOrigin: 'http://localhost:4321/' })
    expect(context.origin).toBe('http://localhost:4321')
    expect(() => docsRobots(context, 'https://other.example.com/sitemap.xml')).toThrow('selected channel origin')
  })
})
