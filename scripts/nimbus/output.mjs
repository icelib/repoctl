import assert from 'node:assert/strict'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { json, repoRoot, run } from '../packaged-template/workspace.mjs'

const pages = ['', 'get-started/', 'writing/', 'zh/', 'zh/get-started/', 'zh/writing/']

export function checkUpgrade(docs) {
  const version = json(path.join(docs, 'package.json')).dependencies['@cloudflare/nimbus-docs']
  const baseline = json(path.join(docs, 'nimbus.json'))
  assert.equal(version, json(path.join(repoRoot, 'templates/nimbus/package.json')).dependencies['@cloudflare/nimbus-docs'])
  assert.deepEqual(baseline, json(path.join(repoRoot, 'templates/nimbus/nimbus.json')))
  assert.equal(baseline.lastReviewedNimbusVersion, version)
  assert.equal(json(path.join(docs, 'node_modules/@cloudflare/nimbus-docs/package.json')).version, version)
  const migration = JSON.parse(run('pnpm', ['exec', 'nimbus-docs', 'migrate', '--dry-run', '--json'], docs))
  assert.equal(migration.status, 'passed')
  assert.equal(migration.baseline.fromVersion, version)
  assert.equal(migration.baseline.targetVersion, version)
  assert.equal(migration.baseline.recorded, true)
  for (const key of ['migrations', 'reviews', 'errors']) {
    assert.deepEqual(migration[key], [], `generated Nimbus template must have no pending ${key}`)
  }
  const check = JSON.parse(run('pnpm', ['exec', 'nimbus-docs', 'check', '--migrations', '--json'], docs))
  const scope = check.scopes.find(item => item.scope === 'migrations')
  assert.equal(scope?.status, 'passed')
  assert.deepEqual(scope.notes, [], 'installed migration check must not skip dependency or baseline checks')
  assert.deepEqual(check.findings, [])
}

export function checkOutput(docs, channel) {
  const read = file => readFileSync(path.join(docs, 'dist', file), 'utf8')
  const preview = channel === 'preview'
  const origin = preview ? 'https://preview.docs.example.com' : 'https://docs.example.com'
  const full = read('llms-full.txt')
  assert.ok(full.includes('Quick start') && full.includes('快速开始'))
  assert.ok(read('llms.txt').includes('/zh/llms.txt'))
  assert.ok(read('zh/llms.txt').includes('/zh/get-started/index.md'))
  for (const page of pages) {
    const chinese = page.startsWith('zh/')
    const html = read(`${page}index.html`)
    assert.ok(html.includes(`lang="${chinese ? 'zh-CN' : 'en'}"`))
    assert.ok(html.includes('data-pagefind-body'))
    assert.ok(html.includes(`rel="canonical" href="${origin}/${page}"`), `${page}: canonical uses channel origin`)
    assert.ok(html.includes(`property="og:url" content="${origin}/${page}"`), `${page}: OG uses channel origin`)
    assert.ok(html.includes(`"url":"${origin}/${page}"`), `${page}: JSON-LD uses channel origin`)
    for (const language of ['en', 'zh-CN', 'x-default']) {
      assert.ok(html.includes(`hreflang="${language}" href="${origin}/`), `${page}: ${language} origin`)
    }
    assert.equal(html.includes('name="robots" content="noindex, nofollow, noarchive"'), preview)
    assert.equal(html.includes('class="docs-preview-notice"'), preview)
    assert.ok(html.includes('application/ld+json'))
    assert.ok(html.includes(`"inLanguage":"${chinese ? 'zh-CN' : 'en'}"`))
    assert.ok(!html.includes('__VITE_PRELOAD__'), 'bundler placeholders must not reach production')
    assert.ok(html.includes(`${page}index.md`))
    assert.ok(read(`${page}index.md`).includes('title:'))
    assert.ok(read(`${page}index.md`).includes(`${origin}/llms.txt`), `${page}: Markdown documentation index`)
    assert.ok(read(`${page}index.md`).includes(`${origin}/${page}`), `${page}: Markdown source`)
    assert.ok(read(`${page}index.mdx`).includes('title:'))
    const nav = html.match(/<nav aria-label="(?:On this site|站点导航)">([\s\S]*?)<\/nav>/)?.[1]
    assert.ok(nav)
    const links = [...nav.matchAll(/href="([^"]+)"/g)].map(match => match[1])
    assert.ok(links.length >= 2)
    assert.ok(links.every(link => link.startsWith('/zh/') === chinese), `locale navigation: ${page}`)
    const alternate = html.match(/class="language-link" href="([^"]+)"/)?.[1]
    assert.ok(alternate && existsSync(path.join(docs, 'dist', alternate, 'index.html')))
  }
  assert.ok(read('writing/index.md').includes('Keep the meaning of an example'))
  const home = read('index.md')
  assert.match(home, /^title: ["']?Welcome["']?$/m)
  assert.ok(home.includes('Start with the essentials') && home.includes('One source, two ways to read'), 'homepage Markdown must render the English homepage')
  assert.notEqual(home, read('llms.txt'), 'authored homepage Markdown must not be replaced with the discovery index')
  assert.ok(read('get-started/index.md').includes('```sh\ncorepack enable'))
  assert.ok(existsSync(path.join(docs, 'dist/pagefind/pagefind.js')))
  assert.equal(existsSync(path.join(docs, 'dist/sitemap-index.xml')), !preview)
  assert.equal(existsSync(path.join(docs, 'dist/sitemap-0.xml')), !preview)
  assert.equal(read('robots.txt').includes('Disallow: /\n'), preview)
  const headers = read('_headers')
  assert.equal(headers.includes('X-Robots-Tag: noindex, nofollow, noarchive'), preview)
  assert.ok(headers.includes('X-Frame-Options: DENY'), 'owner headers survive both channels')
  assert.ok(headers.includes('Cache-Control: public, max-age=42'), 'owner wildcard fields survive both channels')
  assert.ok(headers.includes('# Nimbus agent discovery'), 'Nimbus owns its discovery headers')
  if (!preview) {
    assert.ok(read('robots.txt').includes(`Sitemap: ${origin}/sitemap-index.xml`))
    assert.ok(read('sitemap-0.xml').includes(`${origin}/zh/`))
  }
  for (const file of ['llms.txt', 'llms-full.txt', 'zh/llms.txt']) {
    assert.ok(read(file).includes(origin), `${file}: channel origin`)
    assert.ok(!read(file).includes(preview ? 'https://docs.example.com' : 'https://preview.docs.example.com'), `${file}: no stale channel URL`)
  }
}

export function checkDrafts(docs) {
  for (const locale of ['', 'zh/']) {
    writeFileSync(path.join(docs, 'src/content/docs', locale, 'draft-check.mdx'), '---\ntitle: Draft regression\ndraft: true\n---\n\nPrivate draft marker.\n')
  }
  run('pnpm', ['build'], docs)
  const dist = path.join(docs, 'dist')
  assert.ok(!existsSync(path.join(dist, 'draft-check/index.html')))
  assert.ok(!existsSync(path.join(dist, 'zh/draft-check/index.md')))
  assert.ok(!readFileSync(path.join(dist, 'llms-full.txt'), 'utf8').includes('Private draft marker'))
}

export function checkValidation(docs) {
  const fixtures = [
    ['src/components/invalid.astro', '---\nconst count: number = "invalid"\n---\n<p>{count}</p>\n', ['typecheck'], /not assignable to type/],
    ['src/content/docs/invalid.mdx', '---\ntitle: Invalid\n---\n<Aside>Unclosed\n', ['exec', 'eslint', 'src/content/docs/invalid.mdx'], /Parsing error/],
    ['src/content/docs/invalid.mdx', '---\ntitle: Invalid\n---\n[Missing](/missing-page/)\n', ['lint:docs'], /internal-link/],
  ]
  for (const [file, content, command, diagnostic] of fixtures) {
    const target = path.join(docs, file)
    try {
      writeFileSync(target, content)
      assert.throws(() => run('pnpm', command, docs), diagnostic, `${file} must fail validation`)
    }
    finally {
      rmSync(target, { force: true })
    }
  }
}

export function checkCache(workspace, docs) {
  const hashes = (env = {}) => {
    const output = JSON.parse(run('pnpm', ['exec', 'turbo', 'run', 'build', 'lint', 'typecheck', '--filter=@icebreakers/nimbus-template', '--dry=json'], workspace, env))
    return Object.fromEntries(output.tasks.filter(task => task.package === '@icebreakers/nimbus-template').map(task => [task.task, task.hash]))
  }
  for (const [file, change] of [
    ['src/content/docs/index.mdx', content => `${content}\nContent invalidates the build.\n`],
    ['src/styles/site.css', content => `${content}\n/* cache regression */\n`],
    ['astro.config.ts', content => `${content}\n// cache regression\n`],
    ['src/lib/deployment.ts', content => `${content}\n// cache regression\n`],
    ['scripts/check-locales.mjs', content => `${content}\n// cache regression\n`],
    ['nimbus.json', (content) => {
      const record = JSON.parse(content)
      return `${JSON.stringify({ ...record, reconstructed: !record.reconstructed }, null, 2)}\n`
    }],
  ]) {
    const baseline = hashes()
    const target = path.join(docs, file)
    const original = readFileSync(target, 'utf8')
    try {
      writeFileSync(target, change(original))
      const changed = hashes()
      for (const task of ['build', 'lint', 'typecheck']) {
        assert.notEqual(changed[task], baseline[task], `${file} must invalidate ${task}`)
      }
    }
    finally {
      writeFileSync(target, original)
    }
  }
  for (const name of ['REPO_DOCS_CHANNEL', 'REPO_DOCS_URL']) {
    const baseline = hashes({ REPO_DOCS_CHANNEL: 'preview', REPO_DOCS_URL: 'https://preview.docs.example.com' })
    const changed = hashes({ REPO_DOCS_CHANNEL: 'preview', REPO_DOCS_URL: 'https://preview.docs.example.com', [name]: name === 'REPO_DOCS_CHANNEL' ? 'stable' : 'https://docs.example.com' })
    for (const task of ['build', 'lint', 'typecheck']) {
      assert.notEqual(changed[task], baseline[task], `${name} must invalidate ${task}`)
    }
  }
}
