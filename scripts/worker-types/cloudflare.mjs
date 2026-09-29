import assert from 'node:assert/strict'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import path from 'node:path'
import process from 'node:process'
import { setTimeout as delay } from 'node:timers/promises'
import { execa } from 'execa'
import { run } from './workspace.mjs'

async function availablePort() {
  const server = createServer()
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const { port } = server.address()
  await new Promise(resolve => server.close(resolve))
  return port
}

async function withServer(cwd, args, check, port) {
  // Launch cf directly so termination reaches its dev-server delegate on every OS.
  const command = args[0] === 'exec'
    ? [path.join(cwd, 'node_modules/cf/bin/cf'), ...args.slice(2)]
    : [path.join(cwd, 'dist/node-entry.mjs')]
  const child = execa(process.execPath, command, {
    cwd,
    reject: false,
    env: { WRANGLER_SEND_METRICS: 'false', BROWSER: 'none', NO_COLOR: '1' },
    timeout: 90_000,
    forceKillAfterDelay: 3000,
  })
  let log = ''
  child.stdout.on('data', (data) => {
    log += data
  })
  child.stderr.on('data', (data) => {
    log += data
  })
  console.log(`Checking ${path.basename(cwd)} ${args.join(' ')}...`)
  const base = `http://127.0.0.1:${port}`
  try {
    let ready = false
    for (let attempt = 0; attempt < 120; attempt++) {
      assert.ok(child.exitCode === null || child.exitCode === undefined, `Dev server exited: ${log}`)
      try {
        const response = await fetch(base, { signal: AbortSignal.timeout(500) })
        await response.arrayBuffer()
        if (response.ok) {
          ready = true
          break
        }
      }
      catch {}
      await delay(250)
    }
    assert.ok(ready, `Dev server did not become ready: ${log}`)
    await check(base)
  }
  finally {
    if (process.platform === 'win32') {
      await execa('taskkill', ['/pid', String(child.pid), '/T', '/F'], { reject: false })
    }
    else {
      child.kill('SIGTERM')
    }
    await child
  }
}

export async function checkCloudflareWorkflows(workspace) {
  console.log('Checking packaged Cloudflare deployment and development workflows...')
  for (const name of ['client', 'server', 'website']) {
    console.log(`Checking ${name} deployment output...`)
    const cwd = path.join(workspace, 'apps', name)
    // Cold output catches scripts that accidentally deploy stale static assets.
    rmSync(path.join(cwd, '.cloudflare/output'), { recursive: true, force: true })
    if (name === 'website') {
      rmSync(path.join(cwd, '.vitepress/dist'), { recursive: true, force: true })
    }
    const dryRun = run('pnpm', ['run', 'deploy:dry-run'], cwd)
    assert.match(dryRun, /Dry run complete/)
    assert.ok(existsSync(path.join(cwd, '.cloudflare/output/v0')))
    const config = JSON.parse(readFileSync(path.join(cwd, '.cloudflare/output/v0/workers/default/worker.config.json'), 'utf8'))
    assert.deepEqual(config.compatibilityFlags, ['nodejs_compat'])
    assert.equal(config.compatibilityDate, name === 'website' ? '2026-08-16' : '2025-10-16')
    assert.equal(config.observability.enabled, true)
    if (name === 'client') {
      assert.equal(config.name, 'monorepo-client')
      assert.deepEqual(config.assets, { notFoundHandling: 'single-page-application', runWorkerFirst: ['/api', '/api/*'] })
    }
    else if (name === 'website') {
      // Generated Markdown in deployment output must not become source pages.
      run('pnpm', ['build'], cwd)
      assert.equal(config.name, 'repoctl-docs')
      assert.deepEqual(config.domains, ['repoctl.icebreaker.top'])
      assert.equal(config.workersDev, false)
      assert.equal(config.previewUrls, true)
      assert.equal(config.assets.notFoundHandling, '404-page')
      assert.equal(config.observability.headSamplingRate, 1)
      assert.equal(config.manifest, undefined, 'static docs must not acquire an application handler')
    }
    else {
      assert.equal(config.name, 'monorepo-service')
    }
  }

  const client = path.join(workspace, 'apps/client')
  const clientPort = await availablePort()
  await withServer(client, ['exec', 'cf', 'dev', '--port', String(clientPort)], async (base) => {
    assert.match(await (await fetch(base)).text(), /<div id="app">/)
    assert.deepEqual(await (await fetch(`${base}/api`)).json(), { message: 'Hello World' })
  }, clientPort)

  const server = path.join(workspace, 'apps/server')
  const serverPort = await availablePort()
  await withServer(server, ['exec', 'cf', 'dev', '--port', String(serverPort)], async (base) => {
    assert.match(await (await fetch(base)).text(), /<h1>/)
  }, serverPort)
  // Keep the Node default unchanged, using a free port only in this fixture.
  const configPath = path.join(server, 'src/config.ts')
  const nodeConfig = readFileSync(configPath, 'utf8')
  assert.match(nodeConfig, /8787/)
  const nodePort = await availablePort()
  try {
    writeFileSync(configPath, nodeConfig.replace('8787', String(nodePort)))
    run('pnpm', ['node:build'], server)
    await withServer(server, ['run', 'node:start'], async (base) => {
      assert.match(await (await fetch(base)).text(), /<h1>/)
    }, nodePort)
  }
  finally {
    writeFileSync(configPath, nodeConfig)
  }

  const website = path.join(workspace, 'apps/website')
  const websitePort = await availablePort()
  await withServer(website, ['exec', 'cf', 'dev', '--port', String(websitePort)], async (base) => {
    assert.match(await (await fetch(base)).text(), /repoctl/)
    assert.equal((await fetch(`${base}/missing-cf-test-page`)).status, 404)
    const redirect = await fetch(`${base}/en/reference/templates`, { redirect: 'manual' })
    assert.equal(redirect.status, 301)
    assert.equal(new URL(redirect.headers.get('location'), base).pathname, '/reference/templates')
  }, websitePort)
  assert.match(run('pnpm', ['exec', 'cf', 'workers', 'versions', 'create', '--prebuilt', '--dry-run'], website), /Dry run complete/)
  const rollback = run('pnpm', ['exec', 'cf', 'workers', 'deployments', 'create', '--worker', 'repoctl-docs', '--strategy', 'percentage', '--versions', '[{"version_id":"00000000-0000-4000-8000-000000000001","percentage":100}]', '--dry-run'], website)
  const request = JSON.parse(rollback)
  assert.equal(request.method, 'POST')
  assert.match(request.url, /\/workers\/scripts\/repoctl-docs\/deployments/)
  assert.equal(request.body.versions[0].percentage, 100)
  assert.equal(request.body.versions[0].version_id, '00000000-0000-4000-8000-000000000001')
  assert.equal(request.query?.force, undefined)
  console.log(`Cloudflare workflow checks passed on ${process.platform}.`)
}
