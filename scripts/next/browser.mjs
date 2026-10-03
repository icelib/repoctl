import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { startProductionServer } from './server.mjs'

export async function checkProductionApp(app, screenshot) {
  const server = await startProductionServer(app)
  let browser
  let context
  try {
    const health = await fetch(`${server.origin}/api/health`)
    assert.equal(health.status, 200)
    assert.ok(health.headers.get('cache-control')?.includes('no-store'))
    assert.deepEqual(await health.json(), { status: 'ok' })
    const html = await (await fetch(server.origin)).text()
    assert.ok(html.includes('Next.js workspace'), 'the page must be server rendered')
    assert.ok(html.includes('hello workspace'), 'compiled workspace library must render on the server')
    assert.ok(html.includes('source workspace'), 'source-exporting workspace library must be transpiled')
    browser = await chromium.launch({ headless: true })
    context = await browser.newContext({ viewport: { width: 1000, height: 800 } })
    const page = await context.newPage()
    const errors = []
    const requests = []
    page.on('pageerror', error => errors.push(error.message))
    page.on('console', (message) => {
      if (message.type() === 'error') {
        errors.push(message.text())
      }
    })
    page.on('request', request => requests.push(request.url()))
    await page.goto(server.origin, { waitUntil: 'networkidle' })
    assert.equal(await page.title(), 'Next.js workspace')
    assert.equal(await page.getByText('hello workspace', { exact: true }).isVisible(), true)
    assert.equal(await page.getByText('source workspace', { exact: true }).isVisible(), true)
    const count = page.getByLabel('Count', { exact: true })
    const reset = page.getByRole('button', { name: 'Reset', exact: true })
    assert.equal(await count.textContent(), '0')
    assert.equal(await reset.isDisabled(), true)
    await page.getByRole('button', { name: 'Add one', exact: true }).click()
    await page.getByRole('button', { name: 'Add one', exact: true }).press('Enter')
    await page.waitForFunction(() => document.querySelector('output')?.textContent === '2')
    assert.equal(await count.textContent(), '2')
    await reset.click()
    await page.waitForFunction(() => document.querySelector('output')?.textContent === '0')
    assert.equal(await count.textContent(), '0')
    assert.equal(await reset.isDisabled(), true)
    assert.ok(requests.some(url => /\/_next\/static\/.*\.js/u.test(url)))
    assert.ok(requests.every(url => !url.includes('/src/')), 'production must serve built bundles')
    assert.deepEqual(errors, [])
    if (screenshot) {
      await page.screenshot({ path: screenshot, fullPage: true })
    }
    await page.setViewportSize({ width: 375, height: 812 })
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true)
    console.log('Next production checks passed: server rendering, workspace libraries, health, hydration, pointer, keyboard and mobile layout.')
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
        await server.stop()
        console.log('Closed the task-owned browser and Next production server.')
      }
    }
  }
}
