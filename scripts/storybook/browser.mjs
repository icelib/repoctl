import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import path from 'node:path'
import { chromium } from 'playwright'

export async function checkStorybookBrowser({ directory, defaultText, alternateText, resultText }) {
  const root = path.join(directory, 'storybook-static')
  const types = { '.js': 'text/javascript', '.html': 'text/html', '.json': 'application/json', '.css': 'text/css', '.svg': 'image/svg+xml' }
  const server = createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname)
      const file = path.resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`)
      assert.ok(file.startsWith(`${root}${path.sep}`))
      const content = await readFile(file)
      response.setHeader('Content-Type', types[path.extname(file)] ?? 'application/octet-stream')
      response.end(content)
    }
    catch { response.writeHead(404).end('Not found') }
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const origin = `http://127.0.0.1:${server.address().port}`
  let browser
  let context
  try {
    browser = await chromium.launch({ headless: true })
    context = await browser.newContext()
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    const index = JSON.parse(await readFile(path.join(root, 'index.json'), 'utf8'))
    for (const [name, value] of [['Default', defaultText], ['Alternate', alternateText], ['Interaction', resultText]]) {
      const story = Object.values(index.entries).find(entry => entry.name === name)
      assert.ok(story, `${name} story exists`)
      await page.goto(`${origin}/iframe.html?id=${encodeURIComponent(story.id)}&viewMode=story`, { waitUntil: 'networkidle' })
      await page.getByText(value, { exact: true }).waitFor({ state: 'visible' })
    }
    assert.deepEqual(errors, [])
  }
  finally {
    try {
      await context?.close()
    }
    finally {
      try {
        await browser?.close()
      }
      finally {
        await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
        assert.equal(server.listening, false)
      }
    }
  }
}
