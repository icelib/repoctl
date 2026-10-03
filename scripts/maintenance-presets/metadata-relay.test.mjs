import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { fork } from 'node:child_process'
import { createHash } from 'node:crypto'
import { once } from 'node:events'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { gzipSync } from 'node:zlib'
import { it } from 'vitest'
import { createMetadataRelay } from './metadata-relay.mjs'

async function cacheDirectory(t) {
  const directory = await mkdtemp(path.join(tmpdir(), 'repoctl-metadata-relay-'))
  t.onTestFinished(() => rm(directory, { recursive: true, force: true }))
  return directory
}

async function serve(t, handler) {
  const server = createServer(handler)
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const close = async () => {
    if (!server.listening) {
      return
    }
    const closed = new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
    server.closeAllConnections()
    await closed
  }
  t.onTestFinished(close)
  return { url: `http://127.0.0.1:${server.address().port}`, close }
}

function relay(t, upstream, cachePath) {
  return serve(t, createMetadataRelay({ registry: upstream.url, cachePath }))
}

function request(server, route = '/package', headers) {
  return fetch(`${server.url}${route}`, { headers, signal: AbortSignal.timeout(10_000) })
}

function json(response, body, headers = {}, status = 200) {
  response.writeHead(status, { 'content-type': 'application/json', ...headers })
  response.end(JSON.stringify(body))
}

it('reuses fresh upstream metadata across relay ports and preserves canonical archive URLs', async (t) => {
  const cachePath = await cacheDirectory(t)
  let calls = 0
  const upstream = await serve(t, (_request, response) => {
    calls++
    const body = gzipSync(JSON.stringify({ name: 'package', dist: { tarball: `${upstream.url}/archive.tgz` } }))
    response.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'public, max-age=3600', 'content-encoding': 'gzip', 'content-length': body.length })
    response.end(body)
  })
  const first = await relay(t, upstream, cachePath)
  const second = await relay(t, upstream, cachePath)
  assert.notEqual(first.url, second.url)
  for (const server of [first, second]) {
    const result = await request(server)
    assert.equal(result.status, 200)
    assert.equal(result.headers.get('content-encoding'), null)
    assert.deepEqual(await result.json(), { name: 'package', dist: { tarball: `${upstream.url}/archive.tgz` } })
  }
  assert.equal(calls, 1)
})

it('separates Accept and Vary request representations', async (t) => {
  const cachePath = await cacheDirectory(t)
  let calls = 0
  const upstream = await serve(t, (incoming, response) => {
    calls++
    json(response, { accept: incoming.headers.accept, language: incoming.headers['accept-language'] }, { 'cache-control': 'public, max-age=3600', 'vary': 'Accept, Accept-Language' })
  })
  const server = await relay(t, upstream, cachePath)
  for (const [accept, language] of [['application/json', 'en'], ['application/vnd.npm.install-v1+json', 'en'], ['application/json', 'zh']]) {
    const headers = { accept, 'accept-language': language }
    assert.deepEqual(await (await request(server, '/package', headers)).json(), { accept, language })
    const afterFirst = calls
    assert.deepEqual(await (await request(server, '/package', headers)).json(), { accept, language })
    assert.equal(calls, afterFirst)
  }
  assert.equal(calls, 3)
})

for (const [validator, conditional, value] of [['etag', 'if-none-match', '"revision-one"'], ['last-modified', 'if-modified-since', 'Wed, 01 Jan 2025 00:00:00 GMT']]) {
  it(`revalidates expired metadata with ${validator} and consumes a 304 response`, async (t) => {
    const cachePath = await cacheDirectory(t)
    const received = []
    const upstream = await serve(t, (incoming, response) => {
      received.push(incoming.headers[conditional])
      const headers = { 'cache-control': 'public, max-age=0', [validator]: value }
      if (incoming.headers[conditional] === value) {
        response.writeHead(304, headers)
        response.end()
        return
      }
      json(response, { version: '1.0.0' }, headers)
    })
    const server = await relay(t, upstream, cachePath)
    for (let index = 0; index < 2; index++) {
      const result = await request(server)
      assert.equal(result.status, 200)
      assert.deepEqual(await result.json(), { version: '1.0.0' })
    }
    assert.deepEqual(received, [undefined, value])
  })
}

for (const status of [404, 500]) {
  it(`does not cache an upstream ${status} response`, async (t) => {
    const cachePath = await cacheDirectory(t)
    let calls = 0
    const upstream = await serve(t, (_request, response) => {
      calls++
      json(response, { attempt: calls }, { 'cache-control': 'public, max-age=3600' }, status)
    })
    const server = await relay(t, upstream, cachePath)
    for (let attempt = 1; attempt <= 2; attempt++) {
      const result = await request(server)
      assert.equal(result.status, status)
      assert.deepEqual(await result.json(), { attempt })
    }
    assert.equal(calls, 2)
  })
}

it('does not reuse Vary-star or no-store responses', async (t) => {
  const cachePath = await cacheDirectory(t)
  const calls = new Map()
  const upstream = await serve(t, (incoming, response) => {
    const attempt = (calls.get(incoming.url) ?? 0) + 1
    calls.set(incoming.url, attempt)
    json(response, { attempt }, incoming.url === '/vary' ? { 'cache-control': 'public, max-age=3600', 'vary': '*' } : { 'cache-control': 'no-store' })
  })
  const server = await relay(t, upstream, cachePath)
  for (const route of ['/vary', '/private']) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      assert.deepEqual(await (await request(server, route)).json(), { attempt })
    }
  }
})

it('keeps simultaneous responses intact while sharing the cache', async (t) => {
  const cachePath = await cacheDirectory(t)
  const body = { name: 'package', payload: 'metadata-content-'.repeat(2048) }
  const upstream = await serve(t, (_request, response) => json(response, body, { 'cache-control': 'public, max-age=3600' }))
  const servers = [await relay(t, upstream, cachePath), await relay(t, upstream, cachePath)]
  const results = await Promise.all(Array.from({ length: 12 }, async (_value, index) => {
    const result = await request(servers[index % 2])
    assert.equal(result.status, 200)
    return result.json()
  }))
  for (const result of results) {
    assert.deepEqual(result, body)
  }
  await upstream.close()
  assert.deepEqual(await (await request(servers[0])).json(), body)
})

it('forwards public negotiation headers without downstream authentication or cookies', async (t) => {
  const cachePath = await cacheDirectory(t)
  let received
  const upstream = await serve(t, (incoming, response) => {
    received = incoming.headers
    json(response, { name: 'package' }, { 'cache-control': 'no-store' })
  })
  const server = await relay(t, upstream, cachePath)
  await (await request(server, '/package', { 'authorization': 'Bearer fixture-secret', 'proxy-authorization': 'Basic private-proxy', 'cookie': 'session=private', 'accept': 'application/json', 'accept-language': 'zh' })).json()
  assert.equal(received.authorization, undefined)
  assert.equal(received['proxy-authorization'], undefined)
  assert.equal(received.cookie, undefined)
  assert.equal(received.accept, 'application/json')
  assert.equal(received['accept-language'], 'zh')
})

it('redirects public archives and other routes without fetching or caching them', async (t) => {
  const cachePath = await cacheDirectory(t)
  let calls = 0
  const upstream = await serve(t, (_request, response) => {
    calls++
    response.end('upstream archive')
  })
  const server = await relay(t, upstream, cachePath)
  for (const route of ['/package/-/package-1.0.0.tgz?download=1', '/-/ping']) {
    const result = await fetch(`${server.url}${route}`, { redirect: 'manual', signal: AbortSignal.timeout(10_000) })
    assert.equal(result.status, 302)
    assert.equal(result.headers.get('location'), `${upstream.url}${route}`)
    assert.equal(await result.text(), '')
  }
  assert.equal(calls, 0)
})

it('rejects stale metadata when upstream revalidation fails', async (t) => {
  const cachePath = await cacheDirectory(t)
  const upstream = await serve(t, (_request, response) => json(response, { version: 'old-data' }, { 'cache-control': 'public, max-age=0, stale-if-error=3600', 'etag': '"old"' }))
  const server = await relay(t, upstream, cachePath)
  assert.deepEqual(await (await request(server)).json(), { version: 'old-data' })
  await upstream.close()
  const result = await request(server)
  assert.equal(result.status, 502)
  assert.equal(result.headers.get('cache-control'), 'no-store')
  assert.ok(!(await result.text()).includes('old-data'))
})

async function catalogRegistry(t, directory, registry, cachePath, label) {
  const catalog = []
  for (const [index, name] of ['repoctl', '@fixture/maintenance-preset'].entries()) {
    const archive = path.join(directory, `${label}-${index}.tgz`)
    const bytes = Buffer.from(`${label}:${name}`)
    await writeFile(archive, bytes)
    catalog.push({ metadata: { name, version: '1.0.0' }, archive })
  }
  const file = path.join(directory, `${label}.json`)
  await writeFile(file, JSON.stringify(catalog))
  const child = fork(new URL('./registry.mjs', import.meta.url), [file, registry, cachePath], { execArgv: [], stdio: ['ignore', 'ignore', 'pipe', 'ipc'] })
  let diagnostics = ''
  child.stderr.on('data', (data) => {
    diagnostics += data
  })
  t.onTestFinished(async () => {
    if (child.exitCode === null && child.signalCode === null) {
      const exited = once(child, 'exit')
      child.kill('SIGTERM')
      await exited
    }
  })
  const [message] = await once(child, 'message', { signal: AbortSignal.timeout(10_000) }).catch((error) => {
    throw new Error(`Registry fixture did not start: ${diagnostics}`, { cause: error })
  })
  return { url: `http://127.0.0.1:${message.port}` }
}

it('keeps each catalog and archive independent of shared public metadata', async (t) => {
  const directory = await cacheDirectory(t)
  const cachePath = path.join(directory, 'cache')
  let upstreamCalls = 0
  const upstream = await serve(t, (_request, response) => {
    upstreamCalls++
    json(response, { wrongPublicMetadata: true }, { 'cache-control': 'public, max-age=3600' })
  })
  const publicRelay = await relay(t, upstream, cachePath)
  const routes = ['/repoctl', '/@fixture%2Fmaintenance-preset']
  for (const route of routes) {
    assert.deepEqual(await (await request(publicRelay, route)).json(), { wrongPublicMetadata: true })
  }
  const first = await catalogRegistry(t, directory, upstream.url, cachePath, 'first')
  const second = await catalogRegistry(t, directory, upstream.url, cachePath, 'second')
  assert.notEqual(first.url, second.url)
  for (const [server, label] of [[first, 'first'], [second, 'second']]) {
    for (const route of routes) {
      const metadata = await (await request(server, route)).json()
      const name = decodeURIComponent(route.slice(1))
      const expected = Buffer.from(`${label}:${name}`)
      assert.equal(metadata.name, name)
      assert.deepEqual(Object.keys(metadata.versions), ['1.0.0'])
      const dist = metadata.versions['1.0.0'].dist
      assert.equal(new URL(dist.tarball).origin, server.url)
      assert.equal(dist.integrity, `sha512-${createHash('sha512').update(expected).digest('base64')}`)
      assert.deepEqual(Buffer.from(await (await fetch(dist.tarball, { signal: AbortSignal.timeout(10_000) })).arrayBuffer()), expected)
    }
  }
  assert.equal(upstreamCalls, 2)
})
