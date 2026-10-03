import { pipeline } from 'node:stream/promises'
import fetch from 'make-fetch-happen'

// Only public metadata reaches this relay. Fixture identities and archives stay
// in the per-run catalog; public archive URLs continue to point upstream.
export function createMetadataRelay({ registry, cachePath }) {
  return async (request, response) => {
    const url = `${registry.replace(/\/$/, '')}${request.url}`
    const route = decodeURIComponent(request.url.split('?')[0])
    if (request.method !== 'GET' || !/^\/(?:@[^/]+\/)?[^/]+$/.test(route)) {
      response.writeHead(302, { location: url })
      response.end()
      return
    }
    const headers = Object.fromEntries(['accept', 'accept-language', 'cache-control', 'pragma']
      .filter(name => typeof request.headers[name] === 'string')
      .map(name => [name, request.headers[name]]))
    try {
      const upstream = await fetch(url, { cachePath, headers, retry: 0 })
      // make-fetch-happen may serve stale data after a network error. A smoke
      // check must expose that failure instead of silently validating old data.
      if (upstream.headers.get('x-local-cache-status') === 'stale') {
        upstream.body.destroy()
        throw new Error('Public registry metadata revalidation failed')
      }
      const forwarded = Object.fromEntries(['content-type', 'cache-control', 'date', 'age', 'etag', 'last-modified', 'expires', 'vary']
        .filter(name => upstream.headers.has(name))
        .map(name => [name, upstream.headers.get(name)]))
      response.writeHead(upstream.status, forwarded)
      // The fetch client decompresses responses, so content-encoding and the
      // compressed content-length must not accompany the relayed body.
      await pipeline(upstream.body, response)
    }
    catch (error) {
      if (response.headersSent) {
        response.destroy(error)
        return
      }
      response.writeHead(502, { 'content-type': 'application/json', 'cache-control': 'no-store' })
      response.end(JSON.stringify({ error: error.message }))
    }
  }
}
