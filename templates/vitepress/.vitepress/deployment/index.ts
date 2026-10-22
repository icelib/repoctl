import type { DefaultTheme } from 'vitepress'

export const stableOrigin = 'https://repo.icebreaker.top'
export const previewOrigin = 'https://next.repo.icebreaker.top'

export interface DocsDeployment {
  channel: 'preview' | 'stable'
  preview: boolean
  origin: string
}

export interface DocsThemeConfig extends DefaultTheme.Config {
  docsPreview?: boolean
}

export function getDocsDeployment(channel: string | undefined): DocsDeployment {
  if (channel !== undefined && channel !== '' && channel !== 'preview' && channel !== 'stable') {
    throw new Error(`Unsupported documentation channel: ${channel}`)
  }
  const preview = channel !== 'stable'
  return {
    channel: preview ? 'preview' : 'stable',
    preview,
    origin: preview ? previewOrigin : stableOrigin,
  }
}

export function crawlerFiles(deployment: DocsDeployment) {
  return {
    robots: deployment.preview
      ? 'User-agent: *\nDisallow: /\n'
      : `User-agent: *\nAllow: /\nDisallow: /_headers\n\nSitemap: ${stableOrigin}/sitemap.xml\n`,
    headers: deployment.preview
      ? '/*\n  X-Robots-Tag: noindex, nofollow, noarchive\n'
      : '',
  }
}
