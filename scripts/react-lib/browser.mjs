import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { chromium } from 'playwright'

export async function checkConsumerBrowser(consumer) {
  const require = createRequire(path.join(consumer, 'package.json'))
  const { preview } = await import(pathToFileURL(require.resolve('vite')).href)
  const server = await preview({ root: consumer, preview: { host: '127.0.0.1', port: 0, open: false } })
  let browser
  try {
    const address = server.httpServer.address()
    assert.ok(address && typeof address !== 'string')
    browser = await chromium.launch({ headless: true })
    const page = await browser.newPage()
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.goto(`http://127.0.0.1:${address.port}`, { waitUntil: 'networkidle' })
    const count = page.getByLabel('Consumer count', { exact: true })
    assert.equal(await count.textContent(), '4')
    assert.equal(await page.locator('.repoctl-counter').evaluate(element => getComputedStyle(element).display), 'inline-flex')
    await page.getByRole('button', { name: 'Increase', exact: true }).click()
    assert.equal(await count.textContent(), '7')
    assert.equal(await page.getByLabel('Last change', { exact: true }).textContent(), '7')
    await page.getByRole('button', { name: 'Increase', exact: true }).press('Enter')
    assert.equal(await count.textContent(), '10')
    await page.getByRole('button', { name: 'Reset', exact: true }).click()
    assert.equal(await count.textContent(), '4')
    assert.deepEqual(errors, [])
    console.log('Tarball consumer browser passed: styling, pointer, keyboard, reset and peer React hooks.')
  }
  finally {
    try {
      await browser?.close()
    }
    finally {
      await new Promise((resolve, reject) => server.httpServer.close(error => error ? reject(error) : resolve()))
    }
  }
}
