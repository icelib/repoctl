import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import process from 'node:process'

const bytes = readFileSync(process.argv[2])
const integrity = `sha512-${createHash('sha512').update(bytes).digest('base64')}`
const server = createServer((request, response) => {
  if (request.headers.authorization !== 'Bearer packaged-template-secret') {
    response.writeHead(401)
    response.end('{}')
    return
  }
  if (request.url.endsWith('.tgz')) {
    response.writeHead(200, { 'content-type': 'application/octet-stream' })
    response.end(bytes)
    return
  }
  response.writeHead(200, { 'content-type': 'application/json' })
  response.end(JSON.stringify({
    'name': '@fixture/templates',
    'dist-tags': { latest: '1.2.3' },
    'versions': { '1.2.3': { name: '@fixture/templates', version: '1.2.3', dist: { integrity, tarball: `http://127.0.0.1:${server.address().port}/archive.tgz` } } },
  }))
})
server.listen(0, '127.0.0.1', () => process.send({ port: server.address().port }))
process.on('disconnect', () => server.close())
