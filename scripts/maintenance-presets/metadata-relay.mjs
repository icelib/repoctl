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
      let revalidationFailed = false
      const upstream = await fetch(url, {
        cachePath,
        headers,
        retry: 0,
        onRetry() {
          revalidationFailed = true
        },
      })
      const cacheStatus = upstream.headers.get('x-local-cache-status')
      // Network errors return "stale", while stale-if-error can disguise HTTP
      // failures as "revalidated". Neither can validate a smoke check.
      if (cacheStatus === 'stale' || (cacheStatus === 'revalidated' && revalidationFailed)) {
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
