import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import { createWorkspace, run } from '../packaged-template/workspace.mjs'

const tempRoot = mkdtempSync(path.join(tmpdir(), 'repoctl-packaged-generators-'))
console.log(`Generator regression workspace: ${tempRoot}`)
try {
  const workspace = createWorkspace(tempRoot, ['vue-lib', 'react-lib', 'hono-server'])
  const cases = [
    { generator: 'vue-component', target: 'packages/vue-lib', name: 'action-button', test: 'action-button.test.ts' },
    { generator: 'react-component', target: 'packages/react-lib', name: 'action-button', test: 'action-button.test.tsx' },
    { generator: 'hono-route', target: 'apps/server', name: 'health', test: 'health.test.ts' },
  ]
  for (const sample of cases) {
    const args = ['exec', 'repoctl', 'generate', sample.generator, sample.name, '--package', sample.target, '--export']
    const preview = JSON.parse(run('pnpm', [...args, '--json'], workspace))
    const directory = path.join(workspace, sample.target)
    assert.ok(preview.files.some(file => file.action === 'create'))
    for (const file of preview.files.filter(file => file.action === 'create')) {
      assert.equal(existsSync(path.join(directory, file.path)), false)
    }
    run('pnpm', args, workspace)
    for (const file of preview.files) {
      assert.equal(readFileSync(path.join(directory, file.path), 'utf8'), file.after)
    }
    run('pnpm', args, workspace)
    assert.ok(JSON.parse(run('pnpm', [...args, '--json'], workspace)).files.every(file => file.action === 'unchanged'))
    assert.throws(() => run('pnpm', ['exec', 'repoctl', 'generate', sample.generator, sample.name, '--package', sample.target, '--directory', '../escape'], workspace))
  }
  console.log('Checking generated components and route: build…')
  run('pnpm', ['build'], workspace)
  for (const sample of cases) {
    const directory = path.join(workspace, sample.target)
    if (sample.generator !== 'hono-route') {
      const test = readFileSync(path.join(directory, 'test', sample.test), 'utf8')
        .replace('import ActionButton from \'../src/components/action-button.vue\'', 'import { ActionButton } from \'../dist/index.js\'')
        .replace('import { ActionButton } from \'../src/components/action-button\'', 'import { ActionButton } from \'../dist/index.js\'')
      writeFileSync(path.join(directory, 'test', `built-${sample.test}`), `/* eslint-disable antfu/no-import-dist -- Verify the generated public build. */\n${test}`)
    }
  }
  for (const command of ['lint', 'typecheck', 'tsd', 'test']) {
    console.log(`Checking generated components and route: ${command}…`)
    run('pnpm', [command], workspace)
  }
  const vue = path.join(workspace, 'packages/vue-lib')
  run('pnpm', ['exec', 'stylelint', 'src/components/action-button.vue'], vue)
  const server = path.join(workspace, 'apps/server')
  run('pnpm', ['exec', 'tsdown', 'src/routes/health.ts', '--format', 'esm', '--out-dir', 'dist-generator', '--no-dts'], server)
  const routeFile = readdirSync(path.join(server, 'dist-generator')).find(file => /^health\.(?:mjs|js)$/.test(file))
  assert.ok(routeFile, 'compiled route entry exists')
  run(process.execPath, ['--input-type=module', '-e', `
    import assert from 'node:assert/strict'
    const { healthRoute } = await import(${JSON.stringify(pathToFileURL(path.join(server, 'dist-generator', routeFile)).href)})
    const response = await healthRoute.request('/')
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), { message: 'healthRoute' })
    assert.equal((await healthRoute.request('/', {method: 'POST'})).status, 404)
  `], server)
  console.log('Packaged generators passed: all three frameworks, read-only preview, conflicts, idempotence, checks and built behavior.')
}
finally {
  if (process.env.GENERATORS_SMOKE_KEEP === '1') {
    console.log(`Retained generator regression workspace: ${tempRoot}`)
  }
  else {
    rmSync(tempRoot, { recursive: true, force: true })
  }
}
