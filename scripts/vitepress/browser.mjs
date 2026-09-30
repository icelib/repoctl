import assert from 'node:assert/strict'
import path from 'node:path'
import process from 'node:process'
import { chromium } from 'playwright'
import { serveWebsite } from './server.mjs'

async function waitForDiagrams(page) {
  await page.waitForFunction(() => {
    const diagrams = [...document.querySelectorAll('.mermaid')]
    return diagrams.length === 4 && diagrams.every(element => element.getAttribute('aria-busy') === 'false')
  })
  assert.equal(await page.locator('.mermaid svg').count(), 3)
  assert.equal(await page.locator('.mermaid [role="alert"]').count(), 1)
  const ids = await page.locator('.mermaid svg').evaluateAll(elements => elements.map(element => element.id))
  assert.equal(new Set(ids).size, 3, 'each diagram has a unique SVG id')
  assert.equal(await page.locator('body > div[aria-hidden="true"]').count(), 0, 'temporary rendering containers are removed')
  return ids
}

async function leaveWhileLoading(page, url) {
  const release = Promise.withResolvers()
  const chunk = '**/mermaid.core.*.js'
  await page.route(chunk, async (route) => {
    await release.promise
    await route.continue()
  })
  try {
    await Promise.all([
      page.waitForRequest(/\/mermaid\.core\.[^/]+\.js$/),
      page.goto(`${url}/diagram-acceptance`, { waitUntil: 'domcontentloaded' }),
    ])
    await page.getByRole('link', { name: 'Leave diagrams', exact: true }).click()
    await page.waitForURL('**/start/')
    await page.locator('.mermaid').first().waitFor({ state: 'detached' })
  }
  finally {
    release.resolve()
    await page.unrouteAll({ behavior: 'wait' })
  }
  await page.goBack()
}

export async function checkWebsiteBrowser(website) {
  const server = await serveWebsite(path.join(website, '.vitepress/dist'))
  let browser
  try {
    browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || undefined })
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, colorScheme: 'light' })
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    page.on('console', (message) => {
      if (message.type() === 'error') {
        errors.push(`${page.url()}: ${message.text()}`)
      }
    })
    await leaveWhileLoading(page, server.url)
    const lightIds = await waitForDiagrams(page)
    const lightFill = await page.locator('.mermaid svg .node rect').first().evaluate(element => getComputedStyle(element).fill)
    await page.getByRole('switch').first().click()
    await page.waitForFunction(id => document.querySelector('.mermaid svg')?.id !== id, lightIds[0])
    await waitForDiagrams(page)
    const darkFill = await page.locator('.mermaid svg .node rect').first().evaluate(element => getComputedStyle(element).fill)
    assert.notEqual(darkFill, lightFill, 'dark mode changes diagram colors')
    await page.getByRole('switch').first().click()
    await page.getByRole('link', { name: 'Leave diagrams', exact: true }).click()
    await page.waitForURL('**/start/')
    await page.locator('.mermaid').first().waitFor({ state: 'detached' })
    await page.goBack()
    await waitForDiagrams(page)
    // Leave while redraws are pending; returning must create fresh component instances.
    await page.getByRole('switch').first().click()
    await page.getByRole('link', { name: 'Leave diagrams', exact: true }).click()
    await page.waitForURL('**/start/')
    await page.locator('.mermaid').first().waitFor({ state: 'detached' })
    assert.equal(await page.locator('.mermaid svg').count(), 0)
    await page.goBack()
    await waitForDiagrams(page)
    await page.goto(`${server.url}/zh/diagram-acceptance`)
    await waitForDiagrams(page)
    assert.ok((await page.locator('.mermaid [role="alert"]').textContent()).includes('图表绘制失败'))

    for (const route of ['/', '/zh/', '/reference/commands', '/zh/reference/commands']) {
      await page.goto(`${server.url}${route}`)
      await page.locator('h1').first().waitFor()
      assert.equal(await page.locator('html').getAttribute('lang'), route.startsWith('/zh') ? 'zh-CN' : 'en-US')
      assert.ok(await page.locator('h1').first().textContent())
    }
    await page.goto(`${server.url}/reference/commands`)
    assert.ok(await page.locator('pre.shiki').count() > 0, 'code remains highlighted')
    await page.getByRole('button', { name: /search/i }).first().click()
    await page.locator('#localsearch-input').fill('repo doctor')
    await page.locator('.VPLocalSearchBox .result').first().waitFor()
    await page.keyboard.press('Escape')
    await page.setViewportSize({ width: 390, height: 844 })
    await page.locator('.VPNavBarHamburger').click()
    await page.locator('.VPNavScreen').waitFor({ state: 'visible' })
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false, 'mobile layout fits the viewport')
    // Expected HTTP 404 is checked separately from the no-console-errors assertion.
    assert.deepEqual(errors, [], 'site must not emit browser errors')
    await page.goto(`${server.url}/missing-page`)
    await page.getByRole('heading', { name: 'Page not found' }).waitFor()
  }
  finally {
    await browser?.close()
    await server.close()
  }
}
