import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import process from 'node:process'

const catalog = JSON.parse(readFileSync(process.argv[2], 'utf8')).map((entry, index) => {
  const bytes = readFileSync(entry.archive)
  return { ...entry, bytes, id: `/archives/${index}.tgz`, integrity: `sha512-${createHash('sha512').update(bytes).digest('base64')}` }
})
const server = createServer((request, response) => {
  const route = decodeURIComponent(request.url.split('?')[0])
  const archive = catalog.find(entry => entry.id === route)
  if (archive) {
    response.writeHead(200, { 'content-type': 'application/octet-stream' })
    response.end(archive.bytes)
    return
  }
  const packages = catalog.filter(entry => `/${entry.metadata.name}` === route)
  if (!packages.length) {
    response.writeHead(302, { location: `${process.argv[3].replace(/\/$/, '')}${request.url}` })
    response.end()
    return
  }
  response.writeHead(200, { 'content-type': 'application/json' })
  response.end(JSON.stringify({
    'name': packages[0].metadata.name,
    'dist-tags': { latest: packages.at(-1).metadata.version },
    'versions': Object.fromEntries(packages.map(entry => [entry.metadata.version, { ...entry.metadata, dist: { integrity: entry.integrity, tarball: `http://127.0.0.1:${server.address().port}${entry.id}` } }])),
  }))
})
server.listen(0, '127.0.0.1', () => process.send({ port: server.address().port }))
process.on('disconnect', () => server.close())
