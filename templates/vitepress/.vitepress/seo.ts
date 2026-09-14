import type { HeadConfig, TransformContext } from 'vitepress'

export const siteOrigin = 'https://repoctl.icebreaker.top'

function routeFromPage(page: string) {
  const withoutExtension = page.replace(/\.md$/, '')
  if (withoutExtension === 'index') {
    return '/'
  }
  if (withoutExtension.endsWith('/index')) {
    return `/${withoutExtension.slice(0, -6)}`
  }
  return `/${withoutExtension}`
}

function localeRoutes(page: string) {
  const sourcePage = page.startsWith('zh/') ? page.slice(3) : page
  const english = routeFromPage(sourcePage)
  const chinese = routeFromPage(`zh/${sourcePage}`)
  return { english, chinese }
}

export function createPageHead({ page, title, description }: TransformContext): HeadConfig[] {
  const { english, chinese } = localeRoutes(page)
  const isChinese = page.startsWith('zh/')
  const current = isChinese ? chinese : english
  const canonical = `${siteOrigin}${current}`
  const socialImage = `${siteOrigin}/brand/repoctl-social-${isChinese ? 'zh' : 'en'}.png`
  const socialImageAlt = isChinese
    ? 'repoctl：面向 pnpm 与 Turborepo monorepo 的任务型 CLI'
    : 'repoctl: task-first CLI for pnpm and Turborepo monorepos'
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'Organization', 'name': 'repoctl', 'url': siteOrigin, 'logo': `${siteOrigin}/brand/repoctl-mark.svg`, 'sameAs': ['https://github.com/sonofmagic/repoctl', 'https://www.npmjs.com/package/repoctl'] },
      { '@type': 'SoftwareApplication', 'name': 'repoctl', 'applicationCategory': 'DeveloperApplication', 'operatingSystem': 'macOS, Linux, Windows', 'url': siteOrigin, description, 'sameAs': ['https://github.com/sonofmagic/repoctl', 'https://www.npmjs.com/package/repoctl'], 'offers': { '@type': 'Offer', 'price': '0', 'priceCurrency': 'USD' } },
      { '@type': 'WebSite', 'name': 'repoctl', 'url': siteOrigin, 'potentialAction': { '@type': 'SearchAction', 'target': `${siteOrigin}/reference/commands?q={search_term_string}`, 'query-input': 'required name=search_term_string' } },
    ],
  }

  return [
    ['link', { rel: 'canonical', href: canonical }],
    ['link', { rel: 'alternate', hreflang: 'en', href: `${siteOrigin}${english}` }],
    ['link', { rel: 'alternate', hreflang: 'zh-CN', href: `${siteOrigin}${chinese}` }],
    ['link', { rel: 'alternate', hreflang: 'x-default', href: `${siteOrigin}${english}` }],
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:site_name', content: 'repoctl' }],
    ['meta', { property: 'og:title', content: title }],
    ['meta', { property: 'og:description', content: description }],
    ['meta', { property: 'og:url', content: canonical }],
    ['meta', { property: 'og:locale', content: isChinese ? 'zh_CN' : 'en_US' }],
    ['meta', { property: 'og:image', content: socialImage }],
    ['meta', { property: 'og:image:width', content: '1200' }],
    ['meta', { property: 'og:image:height', content: '630' }],
    ['meta', { property: 'og:image:alt', content: socialImageAlt }],
    ['meta', { property: 'og:image:type', content: 'image/png' }],
    ['meta', { name: 'author', content: 'repoctl contributors' }],
    ['meta', { name: 'application-name', content: 'repoctl' }],
    ['meta', { name: 'twitter:card', content: 'summary_large_image' }],
    ['meta', { name: 'twitter:title', content: title }],
    ['meta', { name: 'twitter:description', content: description }],
    ['meta', { name: 'twitter:image', content: socialImage }],
    ['meta', { name: 'twitter:image:alt', content: socialImageAlt }],
    ['script', { type: 'application/ld+json' }, JSON.stringify(jsonLd)],
  ]
}
