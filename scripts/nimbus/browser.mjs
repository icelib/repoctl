import assert from 'node:assert/strict'
import path from 'node:path'
import process from 'node:process'
import { chromium } from 'playwright'
import { serveWebsite } from '../vitepress/server.mjs'

export async function checkNimbusBrowser(docs, channel) {
  const server = await serveWebsite(path.join(docs, 'dist'), { directoryRoutes: true })
  let browser
  try {
    browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || undefined })
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    page.on('console', (message) => {
      if (message.type() === 'error') {
        errors.push(message.text())
      }
    })
    for (const chinese of [false, true]) {
      await page.goto(`${server.url}${chinese ? '/zh/' : '/'}`)
      const notice = page.locator('.docs-preview-notice')
      assert.equal(await notice.count(), channel === 'preview' ? 1 : 0)
      if (channel === 'preview') {
        assert.ok((await notice.textContent()).includes(chinese ? '尚未发布' : 'unreleased'))
        assert.equal(await notice.locator('a').getAttribute('href'), `https://docs.example.com/${chinese ? 'zh/' : ''}`)
      }
      await page.locator('[data-search] summary').click()
      await page.locator('#docs-search').fill(chinese ? '快速开始' : 'Quick start')
      await page.locator('[data-search] button').click()
      const result = page.locator('.search-results a').filter({ hasText: chinese ? '快速开始' : 'Quick start' }).first()
      await result.waitFor()
      await result.click()
      await page.waitForURL(`**/${chinese ? 'zh/' : ''}get-started/`)
      assert.equal(await page.locator('h1').textContent(), chinese ? '快速开始' : 'Quick start')
      await page.locator('.language-link').click()
      await page.waitForURL(`**/${chinese ? '' : 'zh/'}get-started/`)
      assert.equal(await page.locator('html').getAttribute('lang'), chinese ? 'en' : 'zh-CN')
    }
    await page.goto(`${server.url}/`)
    await page.locator('[data-search] summary').click()
    await page.locator('#docs-search').fill('searchableboundary')
    await page.locator('[data-search] button').click()
    await page.locator('.search-results a').filter({ hasText: 'Searchable noindex' }).first().waitFor()
    await page.setViewportSize({ width: 390, height: 844 })
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false, 'mobile layout fits the viewport')
    assert.deepEqual(errors, [], 'Nimbus browser emits no errors')

    const noJs = await browser.newContext({ javaScriptEnabled: false })
    const staticPage = await noJs.newPage()
    await staticPage.goto(`${server.url}/zh/get-started/`)
    assert.equal(await staticPage.locator('h1').textContent(), '快速开始')
    assert.ok((await staticPage.locator('article').textContent()).includes('corepack enable'))
    assert.equal(await staticPage.locator('.docs-preview-notice').count(), channel === 'preview' ? 1 : 0)
    await noJs.close()
  }
  finally {
    await browser?.close()
    await server.close()
  }
}
