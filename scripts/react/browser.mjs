import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { chromium } from 'playwright'

/** One task-owned headless browser serves the generated application's built output. */
export async function checkPreview(app, screenshot) {
  const require = createRequire(path.join(app, 'package.json'))
  const { preview } = await import(pathToFileURL(require.resolve('vite')).href)
  const server = await preview({ root: app, preview: { host: '127.0.0.1', port: 0, open: false } })
  let browser
  let context
  try {
    const address = server.httpServer.address()
    assert.ok(address && typeof address !== 'string')
    browser = await chromium.launch({ headless: true })
    context = await browser.newContext({ viewport: { width: 1000, height: 800 } })
    const page = await context.newPage()
    const errors = []
    const requests = []
    page.on('pageerror', error => errors.push(error.message))
    page.on('request', request => requests.push(request.url()))
    await page.goto(`http://127.0.0.1:${address.port}`, { waitUntil: 'networkidle' })
    assert.equal(await page.title(), 'React workspace')
    const count = page.getByLabel('Count', { exact: true })
    const reset = page.getByRole('button', { name: 'Reset', exact: true })
    assert.equal(await count.textContent(), '0')
    assert.equal(await reset.isDisabled(), true)
    await page.getByRole('button', { name: 'Add one', exact: true }).click()
    await page.getByRole('button', { name: 'Add one', exact: true }).press('Enter')
    await page.waitForFunction(() => document.querySelector('output')?.textContent === '2')
    assert.equal(await count.textContent(), '2')
    await reset.click()
    assert.equal(await count.textContent(), '0')
    assert.equal(await reset.isDisabled(), true)
    assert.equal(await page.getByText('hello workspace', { exact: true }).textContent(), 'hello workspace')
    assert.ok(requests.some(url => /\/assets\/.*\.js/u.test(url)))
    assert.ok(requests.every(url => !url.includes('/src/')), 'preview must serve production bundles')
    assert.deepEqual(errors, [])
    if (screenshot) {
      await page.screenshot({ path: screenshot, fullPage: true })
    }
    await page.setViewportSize({ width: 375, height: 812 })
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true)
    console.log('Headless preview passed: pointer, keyboard, reset, shared library, mobile layout, no browser errors.')
  }
  finally {
    try {
      if (context) {
        await context.close()
      }
    }
    finally {
      try {
        if (browser) {
          await browser.close()
        }
      }
      finally {
        await new Promise((resolve, reject) => server.httpServer.close(error => error ? reject(error) : resolve()))
        assert.equal(server.httpServer.listening, false)
        console.log('Closed the task-owned browser and preview server.')
      }
    }
  }
}
