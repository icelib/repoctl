export type DocsChannel = 'preview' | 'stable'

export interface DocsContextOptions {
  channel?: string | undefined
  url?: string | undefined
  previewOrigin: string
  stableOrigin: string
}

export interface DocsContext {
  channel: DocsChannel
  preview: boolean
  origin: string
  stableOrigin: string
}

function origin(value: string, label: string) {
  try {
    const url = new URL(value)
    if (!/^https?:\/\/[^/?#\\\s]+\/?$/i.test(value) || url.username || url.password
      || url.search || url.hash || url.pathname !== '/' || value !== value.trim()) {
      throw new Error('Invalid origin')
    }
    return url.origin
  }
  catch {
    throw new Error(`${label} must be an HTTP(S) origin without credentials, path, query or fragment`)
  }
}

/** Resolve public build metadata only; deployment authorization belongs to repo docs. */
export function resolveDocsContext(options: DocsContextOptions): DocsContext {
  const channel = options.channel === undefined || options.channel === '' ? 'preview' : options.channel
  if (channel !== 'preview' && channel !== 'stable') {
    throw new Error('Unsupported documentation channel; expected preview or stable')
  }
  const previewOrigin = origin(options.previewOrigin, 'Documentation previewOrigin')
  const stableOrigin = origin(options.stableOrigin, 'Documentation stableOrigin')
  if (previewOrigin === stableOrigin) {
    throw new Error('Documentation preview and stable origins must be distinct')
  }
  const selected = channel === 'preview' ? previewOrigin : stableOrigin
  if (options.url !== undefined && options.url !== '' && origin(options.url, 'Documentation URL') !== selected) {
    throw new Error('Documentation URL does not match the configured channel origin')
  }
  return { channel, preview: channel === 'preview', origin: selected, stableOrigin }
}

export const docsPreviewRobots = 'noindex, nofollow, noarchive'

/** Sitemap paths belong to the framework; preview never advertises one. */
export function docsRobots(context: DocsContext, sitemapUrl = `${context.origin}/sitemap.xml`): string {
  if (context.preview) {
    return 'User-agent: *\nDisallow: /\n'
  }
  const sitemap = new URL(sitemapUrl)
  if (sitemap.origin !== context.origin || sitemap.username || sitemap.password || sitemap.search || sitemap.hash) {
    throw new Error('Documentation sitemap must use the selected channel origin')
  }
  return `User-agent: *\nAllow: /\nDisallow: /_headers\n\nSitemap: ${sitemap.href}\n`
}
