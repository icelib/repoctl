import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

export function checkWebsiteArtifacts(website, channel = 'preview') {
  const dist = path.join(website, '.vitepress/dist')
  const read = file => readFileSync(path.join(dist, file), 'utf8')
  const preview = channel === 'preview'
  const origin = preview ? 'https://next.repo.icebreaker.top' : 'https://repo.icebreaker.top'
  for (const [file, route, locale] of [['index.html', '/', 'en-US'], ['zh/index.html', '/zh', 'zh-CN'], ['reference/commands.html', '/reference/commands', 'en-US']]) {
    const html = read(file)
    assert.ok(html.includes(`lang="${locale}"`), file)
    assert.ok(html.includes(`rel="canonical" href="${origin}${route}"`), `${file}: canonical URL`)
    assert.equal(html.includes('name="robots" content="noindex, nofollow, noarchive"'), preview, `${file}: crawler policy`)
    assert.equal(html.includes('class="repoctl-preview-banner"'), preview, `${file}: unreleased notice`)
    assert.ok(html.includes('hreflang="en"') && html.includes('hreflang="zh-CN"'), `${file}: locale alternates`)
    const scripts = [...html.matchAll(/<script type="application\/ld\+json">([^<]+)<\/script>/g)]
    const graph = scripts.flatMap(([, json]) => JSON.parse(json)['@graph'] ?? [])
    if (file.endsWith('index.html')) {
      assert.equal(graph.find(item => item['@type'] === 'FAQPage')?.mainEntity.length, 4, `${file}: valid FAQ structured data`)
    }
    assert.ok(!html.includes('{{ JSON.stringify'), `${file}: no unevaluated structured data`)
  }
  // VitePress 2 boots the not-found layout on the client.
  assert.match(read('404.html'), /<title>404[^<]*<\/title>/)
  if (preview) {
    assert.equal(existsSync(path.join(dist, 'sitemap.xml')), false, 'preview does not publish a sitemap')
    assert.equal(read('robots.txt'), 'User-agent: *\nDisallow: /\n')
    assert.ok(read('_headers').includes('X-Robots-Tag: noindex, nofollow, noarchive'))
  }
  else {
    assert.ok(read('sitemap.xml').includes('https://repo.icebreaker.top/zh/'))
    assert.ok(read('robots.txt').includes('Sitemap: https://repo.icebreaker.top/sitemap.xml'))
    assert.ok(!read('_headers').includes('noindex'))
  }
  for (const file of ['llms.txt', 'llms-full.txt']) {
    const text = read(file)
    assert.ok(text.includes('repoctl'), `${file}: populated output`)
    assert.ok(text.includes('/reference/commands'), `${file}: documentation URLs`)
  }
  const diagrams = read('diagram-acceptance.html')
  assert.ok(diagrams.includes('Rendering diagram'), 'SSR renders an accessible placeholder')
  assert.ok(diagrams.includes('language-mermaid'), 'mmd remains a highlighted code block')
}
