import type { DocsLocale } from '../.vitepress/navigation/routes'
import { readdir, readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { homeContent } from '../.vitepress/home/content.ts'
import { routePath, routeSections } from '../.vitepress/navigation/routes.ts'

const root = process.cwd()
const ignoredDirectories = new Set(['.vitepress', '.cloudflare', '.wrangler', 'node_modules'])
const ignoredFiles = new Set(['CHANGELOG.md'])

function toPosixPath(value: string) {
  return value.replaceAll('\\', '/')
}

function relativePath(file: string) {
  return toPosixPath(path.relative(root, file))
}

async function markdownFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory)
  const files = await Promise.all(entries.map(async (entry) => {
    if (ignoredDirectories.has(entry)) {
      return []
    }
    const absolute = path.join(directory, entry)
    const metadata = await stat(absolute)
    if (metadata.isDirectory()) {
      return markdownFiles(absolute)
    }
    return entry.endsWith('.md') && !ignoredFiles.has(entry) ? [absolute] : []
  }))
  return files.flat()
}

function normalizeRoute(route: string) {
  const withoutHash = toPosixPath(route).split('#', 1)[0]!.split('?', 1)[0]!
  const withoutLocale = withoutHash.replace(/^\/zh(?=\/|$)/, '')
  return withoutLocale.replace(/\/index(?:\.md)?$/, '/').replace(/\.md$/, '').replace(/\/$/, '') || '/'
}

function localLinks(markdown: string) {
  const links = [...markdown.matchAll(/\[[^\]]+\]\(([^)\s]+)(?:\s[^)]*)?\)/g)]
    .map(match => match[1]!)
    .filter(link => !/^(?:https?:|mailto:|#)/.test(link))
  return links
}

function headingLevels(markdown: string) {
  const withoutCode = markdown.replace(/```[\s\S]*?```/g, '')
  return [...withoutCode.matchAll(/^(#{1,6})\s+(?:\S.*|[\t\v\f \xA0\u1680\u2000-\u200A\u202F\u205F\u3000\uFEFF])$/gm)].map(match => match[1]!.length)
}

function fencedLanguages(markdown: string) {
  return [...markdown.matchAll(/^```([^\s`]*)/gm)]
    .map(match => match[1]!)
    .filter((_, index) => index % 2 === 0)
}

function contentKeys(value: unknown, prefix = ''): string[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return [prefix]
  }
  return Object.entries(value).flatMap(([key, nested]) => contentKeys(nested, prefix ? `${prefix}.${key}` : key))
}

async function existsAtLocale(sourceFile: string, href: string) {
  const route = href.split('#', 1)[0]!.split('?', 1)[0]!
  const resolved = route.startsWith('/')
    ? path.join(root, route.replace(/^\//, ''))
    : path.resolve(path.dirname(sourceFile), route)
  const candidates = route.endsWith('/')
    ? [path.join(resolved, 'index.md')]
    : [resolved, `${resolved}.md`, path.join(resolved, 'index.md')]
  return (await Promise.all(candidates.map(async (candidate) => {
    try {
      return (await stat(candidate)).isFile()
    }
    catch {
      return false
    }
  }))).some(Boolean)
}

function validateDocument(relativePath: string, markdown: string) {
  const errors: string[] = []
  const isHome = relativePath === 'index.md' || relativePath === 'zh/index.md'
  const isExampleReadme = /(?:^|\/)learn\/packages\/examples\/.*\/README\.md$/.test(relativePath)
  if (isHome || isExampleReadme) {
    return errors
  }
  const headings = headingLevels(markdown)
  if (headings.filter(level => level === 1).length !== 1) {
    errors.push(`${relativePath}: expected one H1`)
  }
  for (let index = 1; index < headings.length; index += 1) {
    if (headings[index]! > headings[index - 1]! + 1) {
      errors.push(`${relativePath}: heading level jumps from H${headings[index - 1]} to H${headings[index]}`)
    }
  }
  const fenceLines = [...markdown.matchAll(/^```([^\s`]*)/gm)]
  if (fenceLines.length % 2 !== 0) {
    errors.push(`${relativePath}: unbalanced code fence`)
  }
  for (const language of fencedLanguages(markdown)) {
    if (!language) {
      errors.push(`${relativePath}: code fences require a language marker`)
    }
  }
  return errors
}

const files = await markdownFiles(root)
const englishFiles = files.filter(file => !relativePath(file).startsWith('zh/'))
const chineseFiles = files.filter(file => relativePath(file).startsWith('zh/'))
const englishPaths = new Set(englishFiles.map(relativePath))
const chinesePaths = new Set(chineseFiles.map(file => relativePath(file).replace(/^zh\//, '')))
const errors: string[] = []

function routeToRelativeFile(route: string) {
  const clean = route.replace(/^\//, '')
  return clean.endsWith('/') ? `${clean}index.md` : `${clean}.md`
}

for (const locale of ['en', 'zh'] as const satisfies readonly DocsLocale[]) {
  const prefix = locale === 'zh' ? '/zh' : ''
  for (const section of routeSections) {
    for (const item of section.items) {
      const route = routePath(section.id, item.slug, locale)
      const relative = routeToRelativeFile(route)
      try {
        if (!(await stat(path.join(root, relative))).isFile()) {
          errors.push(`${locale}: route ${route} is not backed by a Markdown file`)
        }
      }
      catch {
        errors.push(`${locale}: route ${route} is not backed by a Markdown file`)
      }
    }
  }
  if (prefix) {
    const englishRouteCount = routeSections.reduce((count, section) => count + section.items.length, 0)
    if (englishRouteCount === 0) {
      errors.push('route manifest is empty')
    }
  }
}

for (const relativePath of englishPaths) {
  if (!chinesePaths.has(relativePath)) {
    errors.push(`missing Chinese counterpart: zh/${relativePath}`)
  }
}
for (const relativePath of chinesePaths) {
  if (!englishPaths.has(relativePath)) {
    errors.push(`missing English counterpart: ${relativePath}`)
  }
}

for (const file of files) {
  const relative = relativePath(file)
  const markdown = await readFile(file, 'utf8')
  errors.push(...validateDocument(relative, markdown))
  const links = localLinks(markdown)
  for (const href of links) {
    if (/^(?:\/|\.\.\/)(?:repoctl|knowledge|monorepo|why|tools)(?:\/|$)/.test(href)) {
      errors.push(`${relativePath}: link uses a retired route ${href}`)
    }
    if (!await existsAtLocale(file, href)) {
      errors.push(`${relative}: unresolved internal link ${href}`)
    }
  }

  const counterpart = relative.startsWith('zh/')
    ? path.join(root, relative.slice(3))
    : path.join(root, 'zh', relative)
  const counterpartRoute = `/${normalizeRoute(relativePath(counterpart))}`
  if (await existsAtLocale(file, counterpartRoute === '/' ? '/' : counterpartRoute)) {
    continue
  }
  errors.push(`${relative}: counterpart route cannot be resolved`)
}

const englishKeys = contentKeys(homeContent.en).sort()
const chineseKeys = contentKeys(homeContent.zh).sort()
if (englishKeys.join('\n') !== chineseKeys.join('\n')) {
  errors.push('homepage locale content keys differ')
}

if (errors.length > 0) {
  console.error(`Locale parity failed with ${errors.length} issue(s):\n${errors.map(error => `- ${error}`).join('\n')}`)
  process.exitCode = 1
}
else {
  console.log(`Locale parity passed for ${englishPaths.size} English and ${chinesePaths.size} Chinese Markdown pages.`)
}
