import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { chromium } from 'playwright'
import { registry, run, writeJson } from '../packaged-template/workspace.mjs'

/** A Server Component imports the packed client entry without an application wrapper. */
export async function checkNextConsumer(tempRoot, archive, manifest, packageManager) {
  const consumer = path.join(tempRoot, 'next-consumer')
  mkdirSync(path.join(consumer, 'app'), { recursive: true })
  writeJson(path.join(consumer, 'package.json'), {
    name: 'react-library-rsc-consumer',
    private: true,
    type: 'module',
    packageManager,
    dependencies: { [manifest.name]: `file:${archive}`, 'next': '16.3.8', 'react': '19.3.0', 'react-dom': '19.3.0' },
  })
  writeFileSync(path.join(consumer, 'pnpm-workspace.yaml'), 'packages: []\n')
  writeFileSync(path.join(consumer, 'app/layout.jsx'), `import '${manifest.name}/style.css'
export default function Layout({children}) { return <html lang="en"><body>{children}</body></html> }
`)
  writeFileSync(path.join(consumer, 'app/page.jsx'), `import { Counter } from '${manifest.name}'
export default function Page() { return <Counter label="Server component count" initialCount={5} step={2} /> }
`)
  run('corepack', ['enable'], consumer)
  run('pnpm', ['install', '--ignore-scripts', '--registry', registry], consumer)
  run('pnpm', ['exec', 'next', 'build'], consumer)
  const require = createRequire(path.join(consumer, 'package.json'))
  const { default: next } = await import(pathToFileURL(require.resolve('next')).href)
  const app = next({ dev: false, dir: consumer, hostname: '127.0.0.1', port: 0 })
  let server
  let browser
  try {
    await app.prepare()
    server = createServer(app.getRequestHandler())
    await new Promise((resolve, reject) => {
      server.once('error', reject)
      server.listen(0, '127.0.0.1', resolve)
    })
    const address = server.address()
    assert.ok(address && typeof address !== 'string')
    browser = await chromium.launch({ headless: true })
    const page = await browser.newPage()
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.goto(`http://127.0.0.1:${address.port}`, { waitUntil: 'networkidle' })
    const count = page.getByLabel('Server component count', { exact: true })
    assert.equal(await count.textContent(), '5')
    assert.equal(await page.locator('.repoctl-counter').evaluate(element => getComputedStyle(element).display), 'inline-flex')
    await page.getByRole('button', { name: 'Increase', exact: true }).click()
    assert.equal(await count.textContent(), '7')
    assert.deepEqual(errors, [])
    console.log('Next App Router tarball consumer passed: direct server import, CSS and hydrated client interaction.')
  }
  finally {
    try {
      await browser?.close()
    }
    finally {
      try {
        if (server?.listening) {
          await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
        }
      }
      finally {
        await app.close()
      }
    }
  }
}
