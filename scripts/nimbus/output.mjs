import assert from 'node:assert/strict'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { run } from './workspace.mjs'

const pages = ['', 'get-started/', 'writing/', 'zh/', 'zh/get-started/', 'zh/writing/']

export function checkOutput(docs) {
  const read = file => readFileSync(path.join(docs, 'dist', file), 'utf8')
  const full = read('llms-full.txt')
  assert.ok(full.includes('Quick start') && full.includes('快速开始'))
  assert.ok(read('llms.txt').includes('/zh/llms.txt'))
  assert.ok(read('zh/llms.txt').includes('/zh/get-started/index.md'))
  for (const page of pages) {
    const chinese = page.startsWith('zh/')
    const html = read(`${page}index.html`)
    assert.ok(html.includes(`lang="${chinese ? 'zh-CN' : 'en'}"`))
    assert.ok(html.includes('data-pagefind-body'))
    assert.ok(html.includes('application/ld+json'))
    assert.ok(html.includes(`"inLanguage":"${chinese ? 'zh-CN' : 'en'}"`))
    assert.ok(!html.includes('__VITE_PRELOAD__'), 'bundler placeholders must not reach production')
    assert.ok(html.includes(`${page}index.md`))
    assert.ok(read(`${page}index.md`).includes('title:'))
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
  assert.ok(read('get-started/index.md').includes('```sh\ncorepack enable'))
  assert.ok(existsSync(path.join(docs, 'dist/pagefind/pagefind.js')))
  assert.ok(existsSync(path.join(docs, 'dist/sitemap-index.xml')))
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
  const hashes = () => {
    const output = JSON.parse(run('pnpm', ['exec', 'turbo', 'run', 'build', 'lint', 'typecheck', '--filter=@icebreakers/nimbus-template', '--dry=json'], workspace))
    return Object.fromEntries(output.tasks.filter(task => task.package === '@icebreakers/nimbus-template').map(task => [task.task, task.hash]))
  }
  for (const [file, addition] of [
    ['src/content/docs/index.mdx', '\nContent invalidates the build.\n'],
    ['src/styles/site.css', '\n/* cache regression */\n'],
    ['astro.config.ts', '\n// cache regression\n'],
  ]) {
    const baseline = hashes()
    const target = path.join(docs, file)
    const original = readFileSync(target, 'utf8')
    writeFileSync(target, original + addition)
    const changed = hashes()
    for (const task of ['build', 'lint', 'typecheck']) {
      assert.notEqual(changed[task], baseline[task], `${file} must invalidate ${task}`)
    }
    writeFileSync(target, original)
  }
}
