import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import path from 'node:path'

const contentTypes = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain',
}

export async function serveWebsite(directory) {
  const server = createServer(async (request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname)
    const file = pathname.endsWith('/') ? `${pathname}index.html` : path.extname(pathname) ? pathname : `${pathname}.html`
    const target = path.resolve(directory, `.${file}`)
    try {
      if (!target.startsWith(`${directory}${path.sep}`)) {
        throw new Error('Invalid path')
      }
      const content = await readFile(target)
      response.setHeader('Content-Type', contentTypes[path.extname(file)] ?? 'application/octet-stream')
      response.end(content)
    }
    catch {
      response.writeHead(404, { 'Content-Type': 'text/html' })
      response.end(await readFile(path.join(directory, '404.html')))
    }
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const url = `http://127.0.0.1:${server.address().port}`
  return { url, close: () => new Promise(resolve => server.close(resolve)) }
}
