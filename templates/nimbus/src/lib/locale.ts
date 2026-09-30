import type { SidebarItem } from '@cloudflare/nimbus-docs/types'

export function isChinese(path: string) {
  return path === '/zh' || path.startsWith('/zh/')
}

export function alternatePath(path: string) {
  return isChinese(path) ? path.slice(3) || '/' : `/zh${path}`
}

export function localizeSidebar(items: SidebarItem[], chinese: boolean): SidebarItem[] {
  return items.flatMap((item): SidebarItem[] => {
    if (item.type !== 'group') {
      return item.type === 'external' || isChinese(item.href) === chinese ? [item] : []
    }
    const children = localizeSidebar(item.children, chinese)
    const indexHref = item.indexHref && isChinese(item.indexHref) === chinese ? item.indexHref : undefined
    if (!children.length && !indexHref) {
      return []
    }
    return [{ ...item, indexHref, children }]
  })
}

export const labels = {
  en: {
    navigation: 'On this site',
    contents: 'On this page',
    skip: 'Skip to content',
    search: 'Search documentation',
    submit: 'Search',
    empty: 'No matching pages.',
    loading: 'Searching…',
    unavailable: 'Search is unavailable. Try again after building the site.',
    markdown: 'Read Markdown',
    index: 'Documentation index',
  },
  zh: {
    navigation: '站点导航',
    contents: '本页目录',
    skip: '跳转到正文',
    search: '搜索文档',
    submit: '搜索',
    empty: '没有找到匹配的页面。',
    loading: '正在搜索…',
    unavailable: '搜索暂不可用，请构建站点后重试。',
    markdown: '阅读 Markdown',
    index: '文档索引',
  },
} as const
