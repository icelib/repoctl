import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { json } from '../packaged-template/workspace.mjs'

function headerRules(content) {
  const rules = new Map()
  let current
  for (const line of content.split(/\r?\n/u)) {
    if (!line.trim() || line.trimStart().startsWith('#')) {
      continue
    }
    if (!/^\s/u.test(line)) {
      current = line.trim()
      rules.set(current, rules.get(current) ?? [])
    }
    else {
      assert.ok(current, 'header fields must belong to a path')
      rules.get(current).push(line.trim())
    }
  }
  return rules
}

export function checkDiscovery(docs, origin) {
  const dist = path.join(docs, 'dist')
  const manifest = json(path.join(dist, '.well-known/ard.json'))
  assert.deepEqual(json(path.join(dist, '.well-known/ai-catalog.json')), manifest, 'legacy AI Catalog must describe the same resources as ARD')
  assert.equal(manifest.specVersion, '1.0')
  assert.deepEqual(manifest.host, {
    displayName: 'Project docs',
    identifier: `${origin}/`,
    documentationUrl: `${origin}/`,
  })
  const resources = manifest.entries.map(entry => [entry.identifier, entry.type, entry.url])
  assert.deepEqual(resources, [
    [`urn:air:${new URL(origin).hostname}:docs:index`, 'text/plain', `${origin}/llms.txt`],
    [`urn:air:${new URL(origin).hostname}:docs:home`, 'text/markdown', `${origin}/index.md`],
  ])
  for (const entry of manifest.entries) {
    assert.ok(entry.displayName.includes('Project docs'))
    assert.equal(entry.representativeQueries.length, 2)
    assert.ok(entry.representativeQueries.every(query => typeof query === 'string' && query.length > 0))
    const target = new URL(entry.url)
    assert.equal(target.origin, origin)
    assert.ok(existsSync(path.join(dist, decodeURIComponent(target.pathname))), `discovery resource must exist: ${entry.url}`)
  }
  const headers = headerRules(readFileSync(path.join(dist, '_headers'), 'utf8'))
  for (const link of [
    `Link: <${origin}/.well-known/ard.json>; rel="ard"`,
    `Link: <${origin}/llms.txt>; rel="describedby"; type="text/plain"`,
    `Link: <${origin}/index.md>; rel="alternate"; type="text/markdown"`,
  ]) {
    assert.ok(headers.get('/')?.includes(link), `homepage must advertise ${link}`)
  }
  for (const file of ['ard.json', 'ai-catalog.json']) {
    const fields = headers.get(`/.well-known/${file}`)
    assert.ok(fields?.includes('Content-Type: application/json'))
    assert.ok(fields?.includes('Access-Control-Allow-Origin: *'))
  }
  assert.ok(headers.get('/index.md')?.includes('Content-Type: text/markdown; charset=utf-8'))
}
