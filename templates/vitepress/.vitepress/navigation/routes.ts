import type { DefaultTheme } from 'vitepress'

export type DocsLocale = 'en' | 'zh'

interface LocalizedText {
  en: string
  zh: string
}

export interface RouteItem {
  slug: string
  label: LocalizedText
}

export interface RouteSection {
  id: 'start' | 'tasks' | 'reference' | 'learn' | 'ai'
  label: LocalizedText
  items: readonly RouteItem[]
}

const item = (slug: string, en: string, zh: string): RouteItem => ({ slug, label: { en, zh } })

export const routeSections = [
  {
    id: 'start',
    label: { en: 'Start', zh: '开始' },
    items: [
      item('', 'Start here', '从这里开始'),
      item('install', 'Install and initialize', '安装并初始化'),
      item('first-run', 'Your first run', '第一次运行'),
      item('diagnose', 'Run a diagnosis', '运行诊断'),
      item('choose-next', 'Choose the next task', '选择下一项任务'),
    ],
  },
  {
    id: 'tasks',
    label: { en: 'Tasks', zh: '任务' },
    items: [
      item('', 'Task index', '任务索引'),
      item('adopt-existing', 'Adopt an existing workspace', '接入已有 workspace'),
      item('create-project', 'Create a package or app', '创建包或应用'),
      item('checks', 'Run checks', '运行校验'),
      item('reports', 'Reports and output', '报告与输出'),
      item('ci', 'Add checks to CI', '把校验加入 CI'),
      item('release', 'Release packages', '发布包'),
      item('troubleshooting', 'Troubleshoot', '排障'),
    ],
  },
  {
    id: 'reference',
    label: { en: 'Reference', zh: '参考' },
    items: [
      item('', 'Reference overview', '参考总览'),
      item('commands', 'Command reference', '命令参考'),
      item('config', 'Configuration', '配置文件'),
      item('dependencies', 'Dependency consistency', '依赖版本一致性'),
      item('knip', 'Unused code and dependencies', '闲置代码与依赖检查'),
      item('execution-model', 'Execution model', '执行模型'),
      item('output', 'Output formats', '输出格式'),
      item('aliases', 'Command aliases', '命令别名'),
      item('templates', 'Templates', '模板'),
      item('template-assets', 'Managed template assets', '受管模板资产'),
    ],
  },
  {
    id: 'learn',
    label: { en: 'Learn', zh: '理解' },
    items: [
      item('', 'Learn overview', '理解总览'),
      item('repoctl-model', 'How repoctl fits in', 'repoctl 如何融入仓库'),
      item('monorepo/', 'Monorepo foundations', 'Monorepo 基础'),
      item('monorepo/manage', 'Manage a monorepo', '管理 Monorepo'),
      item('monorepo/publish', 'Publishing and changelogs', '发包与变更日志'),
      item('monorepo/commands', 'Monorepo commands', 'Monorepo 命令'),
      item('monorepo/templates', 'Template systems', '模板体系'),
      item('monorepo/troubleshooting', 'Monorepo troubleshooting', 'Monorepo 排障'),
      item('packages/', 'Modern npm packages', '现代 npm 包'),
      item('packages/modern-overview', 'Modern package guide', '现代包指南'),
      item('packages/reuse-javascript', 'Reuse JavaScript', '复用 JavaScript'),
      item('packages/module-extensions', 'Module extensions', '模块文件后缀'),
      item('packages/runtime-globals', 'Runtime globals', '运行时关键字'),
      item('packages/publish', 'Publish a package', '发布 npm 包'),
      item('packages/modern/', 'Package details', '现代包细节'),
      item('packages/modern/esm-vs-cjs', 'ESM and CommonJS', 'ESM 与 CommonJS'),
      item('packages/modern/dts', 'Type declarations', '类型声明'),
      item('packages/modern/package-entry-points', 'Package entry points', '包入口'),
      item('packages/modern/bundlers', 'Bundlers', '构建工具'),
      item('packages/modern/typescript', 'TypeScript', 'TypeScript'),
      item('tools/', 'Tool guides', '工具专题'),
      item('tools/pnpm', 'pnpm', 'pnpm'),
      item('tools/turborepo', 'Turborepo', 'Turborepo'),
      item('tools/changeset', 'Versioning', '版本管理'),
      item('tools/husky', 'Husky', 'Husky'),
      item('tools/lint-staged', 'lint-staged', 'lint-staged'),
      item('tools/renovate', 'Renovate', 'Renovate'),
      item('tools/llms-txt', 'llms.txt', 'llms.txt'),
    ],
  },
  {
    id: 'ai',
    label: { en: 'AI', zh: 'AI' },
    items: [
      item('', 'AI documentation', 'AI 文档'),
      item('llms-txt', 'llms.txt', 'llms.txt'),
    ],
  },
] as const satisfies readonly RouteSection[]

export type RouteSectionId = (typeof routeSections)[number]['id']

function prefixFor(locale: DocsLocale) {
  return locale === 'zh' ? '/zh' : ''
}

export function routePath(section: RouteSectionId, slug: string, locale: DocsLocale) {
  const prefix = prefixFor(locale)
  return `${prefix}/${section}/${slug}`.replace(/\/+/g, '/')
}

function sectionItems(section: RouteSection, locale: DocsLocale): DefaultTheme.SidebarItem[] {
  return section.items.map(route => ({
    text: route.label[locale],
    link: routePath(section.id, route.slug, locale),
  }))
}

export function createSidebars(locale: DocsLocale): DefaultTheme.SidebarMulti {
  const prefix = prefixFor(locale)
  return Object.fromEntries(routeSections.map(section => [
    `${prefix}/${section.id}/`,
    [{ text: section.label[locale], items: sectionItems(section, locale) }],
  ]))
}

export function createNav(locale: DocsLocale): DefaultTheme.NavItem[] {
  const prefix = prefixFor(locale)
  const text = locale === 'zh'
    ? { start: '开始', tasks: '任务', reference: '参考', learn: '理解', ai: 'AI 文档' }
    : { start: 'Start', tasks: 'Tasks', reference: 'Reference', learn: 'Learn', ai: 'AI Docs' }
  return (Object.keys(text) as RouteSectionId[]).map(section => ({
    text: text[section],
    link: `${prefix}/${section}/`.replace(/\/+/g, '/'),
  }))
}

export function allDocumentRoutes(locale: DocsLocale) {
  return routeSections.flatMap(section => section.items.map(item => routePath(section.id, item.slug, locale)))
}
