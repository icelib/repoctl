import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createWorkspace, json, registry, run, writeJson } from '../packaged-template/workspace.mjs'
import { checkLifecycle, freePort } from './lifecycle.mjs'

const temporary = mkdtempSync(path.join(tmpdir(), 'repoctl-capability-'))
console.log(`Packaged capability fixture: ${temporary}`)
try {
  const workspace = createWorkspace(temporary, ['tsdown'])
  const app = path.join(workspace, 'apps/vue-app')
  mkdirSync(path.join(app, 'src'), { recursive: true })
  writeJson(path.join(app, 'package.json'), {
    name: 'vue-app',
    private: true,
    type: 'module',
    scripts: { build: 'vite build', preview: 'vite preview' },
    dependencies: { vue: '^3.5.43' },
    devDependencies: { '@vitejs/plugin-vue': '^6.0.9', 'vite': '^8.3.2' },
  })
  writeFileSync(path.join(app, 'index.html'), '<!doctype html><html><body><div id="app"></div><script type="module" src="/src/main.js"></script></body></html>\n')
  writeFileSync(path.join(app, 'vite.config.js'), 'import vue from \'@vitejs/plugin-vue\'\nimport { defineConfig } from \'vite\'\nexport default defineConfig({ plugins: [vue()] })\n')
  writeFileSync(path.join(app, 'src/main.js'), 'import { createApp } from \'vue\'\nimport App from \'./app.vue\'\ncreateApp(App).mount(\'#app\')\n')
  const appSource = '<script setup>\nimport { ref } from \'vue\'\nconst count = ref(0)\n</script>\n<template><main><button type="button" @click="count++">Increment</button><p>Count: {{ count }}</p></main></template>\n'
  writeFileSync(path.join(app, 'src/app.vue'), appSource)
  const localPort = await freePort()
  let ciPort = await freePort()
  while (ciPort === localPort) {
    ciPort = await freePort()
  }
  const args = ['exec', 'repoctl', 'tooling', 'capability', 'plan', 'playwright', '--target', 'vue-app', '--route', '/', '--role', 'button', '--name', 'Increment', '--expect-text', 'Count: 1', '--port', String(localPort), '--ci-port', String(ciPort), '--reuse-existing-server', '--json']
  const plan = JSON.parse(run('pnpm', args, workspace))
  assert.equal(plan.status, 'ready')
  assert.equal(existsSync(path.join(workspace, 'e2e/vue-app')), false)
  writeJson(path.join(workspace, 'capability-plan.json'), plan)
  const apply = ['exec', 'repoctl', 'tooling', 'capability', 'apply', 'capability-plan.json', '--json']
  assert.equal(JSON.parse(run('pnpm', apply, workspace)).status, 'applied')
  assert.equal(JSON.parse(run('pnpm', apply, workspace)).status, 'unchanged')
  assert.equal(readFileSync(path.join(app, 'src/app.vue'), 'utf8'), appSource)
  assert.equal(json(path.join(workspace, 'package.json')).scripts['test:packaged-capability'], undefined)
  run('pnpm', ['install', '--ignore-scripts', '--no-frozen-lockfile', '--registry', registry], workspace)
  for (const command of ['build', 'lint', 'typecheck', 'tsd', 'test']) {
    console.log(`Generated workspace: ${command}`)
    run('pnpm', [command], workspace)
  }
  const e2e = path.join(workspace, 'e2e/vue-app')
  run('pnpm', ['exec', 'playwright', 'install', 'chromium'], e2e)
  rmSync(path.join(app, 'dist'), { recursive: true, force: true })
  await checkLifecycle({ workspace, app, e2e, localPort, ciPort })
  console.log('Packaged capability passed: preview, apply, idempotency, build/lint/types and headless success/failure/interruption/borrowed-server cleanup.')
}
finally {
  rmSync(temporary, { recursive: true, force: true })
}
