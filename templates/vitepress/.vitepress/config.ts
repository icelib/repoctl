import Tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vitepress'
import llmstxt from 'vitepress-plugin-llms'
import { withMermaid } from 'vitepress-plugin-mermaid'
import { createNav, createSidebars } from './navigation/routes'
import { createPageHead, siteOrigin } from './seo'

export default withMermaid(defineConfig({
  outDir: '.vitepress/dist',
  srcExclude: ['CHANGELOG.md', 'learn/packages/examples/**', 'zh/learn/packages/examples/**'],
  title: 'repoctl',
  titleTemplate: ':title — Official CLI for pnpm and Turborepo Monorepos',
  description: 'A practical CLI guide for setting up, checking, and maintaining pnpm and Turborepo monorepos.',
  lastUpdated: true,
  cleanUrls: true,
  sitemap: { hostname: siteOrigin },
  transformHead: createPageHead,
  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: '/brand/repoctl-mark.svg' }],
    ['link', { rel: 'icon', type: 'image/svg+xml', href: '/brand/repoctl-mark-dark.svg', media: '(prefers-color-scheme: dark)' }],
    ['link', { rel: 'alternate icon', type: 'image/x-icon', href: '/brand/favicon.ico' }],
    ['link', { rel: 'apple-touch-icon', sizes: '180x180', href: '/brand/apple-touch-icon.png' }],
  ],
  themeConfig: {
    logo: {
      light: '/brand/repoctl-mark.svg',
      dark: '/brand/repoctl-mark-dark.svg',
      alt: 'repoctl',
    },
    search: { provider: 'local' },
    socialLinks: [{ icon: 'github', link: 'https://github.com/icelib/repoctl' }],
  },
  locales: {
    root: {
      label: 'English',
      lang: 'en-US',
      title: 'repoctl',
      description: 'A practical CLI guide for setting up, checking, and maintaining pnpm and Turborepo monorepos.',
      themeConfig: {
        nav: createNav('en'),
        outline: { label: 'On This Page', level: [2, 3] },
        sidebar: createSidebars('en'),
        editLink: {
          pattern: 'https://github.com/icelib/repoctl/edit/main/templates/vitepress/:path',
          text: 'Edit this page',
        },
        docFooter: { prev: 'Previous page', next: 'Next page' },
        lastUpdated: { text: 'Last updated' },
      },
    },
    zh: {
      label: '简体中文',
      lang: 'zh-CN',
      link: '/zh/',
      title: 'repoctl',
      description: '面向 pnpm 与 Turborepo monorepo 的实用 CLI 文档。',
      themeConfig: {
        nav: createNav('zh'),
        outline: { label: '目录', level: [2, 3] },
        sidebar: createSidebars('zh'),
        editLink: {
          pattern: 'https://github.com/icelib/repoctl/edit/main/templates/vitepress/:path',
          text: '为此页提供修改建议',
        },
        docFooter: { prev: '上一页', next: '下一页' },
        lastUpdated: { text: '最后更新' },
      },
    },
  },
  vite: {
    plugins: [
      // @ts-ignore vitepress-plugin-llms currently exposes Vite 6 plugin types.
      Tailwindcss(),
      llmstxt({
        title: 'repoctl',
        description: 'Practical documentation for setting up, checking, and maintaining pnpm and Turborepo monorepos. Chinese documentation is available under /zh/.',
        domain: siteOrigin,
        ignoreFiles: [
          'zh/**',
          'en/**',
          'CHANGELOG.md',
          'thinking.md',
          'learn/packages/examples/**',
          '.vitepress/**',
          '**/node_modules/**',
          '**/internal/**',
          '**/fixtures/**',
        ],
      }),
    ],
  },
  mermaid: {},
}))
