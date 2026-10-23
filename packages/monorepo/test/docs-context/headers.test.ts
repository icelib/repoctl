import { mergeDocsHeaders, resolveDocsContext } from '@icebreakers/monorepo/docs-context'
import { describe, expect, it } from 'vitest'

const preview = resolveDocsContext({ previewOrigin: 'https://preview.example.com', stableOrigin: 'https://docs.example.com' })
const stable = { ...preview, channel: 'stable' as const, preview: false, origin: preview.stableOrigin }

describe('owned documentation headers', () => {
  it.each(['\n', '\r\n'])('preserves user and Nimbus rules through repeated channel transitions (%j)', (newline) => {
    const original = [
      '# owner policy',
      '/*',
      '  Cache-Control: public, max-age=60',
      '  X-Frame-Options: DENY',
      '',
      '# Nimbus agent discovery (generated)',
      '/',
      '  Link: </llms.txt>; rel="describedby"',
      '# End Nimbus agent discovery',
      '',
      '/private/*',
      '  X-Robots-Tag: noindex',
      '',
    ].join(newline)
    const rendered = mergeDocsHeaders(original, preview)
    expect(rendered.match(/^\/\*\r?$/gm)).toHaveLength(1)
    expect(rendered).toContain(`X-Robots-Tag: noindex, nofollow, noarchive${newline}`)
    expect(mergeDocsHeaders(rendered, preview)).toBe(rendered)
    expect(mergeDocsHeaders(rendered, stable)).toBe(original)
    expect(mergeDocsHeaders(mergeDocsHeaders(rendered, stable), preview)).toBe(rendered)
  })

  it('owns an entire wildcard block only when no owner wildcard exists', () => {
    const original = '/assets/*\n  Cache-Control: immutable\n'
    const rendered = mergeDocsHeaders(original, preview)
    expect(rendered.startsWith(original)).toBe(true)
    expect(mergeDocsHeaders(rendered, stable)).toBe(original)
    expect(mergeDocsHeaders('', stable)).toBe('')
    expect(mergeDocsHeaders(mergeDocsHeaders('', preview), stable)).toBe('')
  })

  it.each([
    '# repoctl docs preview (generated)\n/*\n',
    '# End repoctl docs preview\n',
    '# repoctl docs preview (generated)\n# repoctl docs preview headers (generated)\n# End repoctl docs preview headers\n# End repoctl docs preview\n',
    '# repoctl docs preview (generated)\n# End repoctl docs preview headers\n',
    '# repoctl docs preview malformed\n',
  ])('rejects malformed ownership instead of erasing foreign content', (content) => {
    expect(() => mergeDocsHeaders(content, preview)).toThrow(/documentation header marker/)
    expect(() => mergeDocsHeaders(content, stable)).toThrow(/documentation header marker/)
  })
})
