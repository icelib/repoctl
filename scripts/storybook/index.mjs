import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { createWorkspace, json, registry, run, writeJson } from '../packaged-template/workspace.mjs'
import { checkStorybookBrowser } from './browser.mjs'
import { createReactLibrary } from './fixtures.mjs'
import { checkStorybookLifecycle } from './lifecycle.mjs'

function packContents(library, output) {
  mkdirSync(output)
  run('pnpm', ['pack', '--pack-destination', output], library)
  const tarball = path.join(output, readdirSync(output).find(file => file.endsWith('.tgz')))
  const files = run('tar', ['-tzf', tarball], library).trim().split('\n').filter(file => !file.endsWith('/')).sort()
  return Object.fromEntries(files.map(file => [file, createHash('sha256').update(run('tar', ['-xOf', tarball, file], library)).digest('hex')]))
}

const temporary = mkdtempSync(path.join(tmpdir(), 'repoctl-storybook-'))
console.log(`Packaged Storybook fixture: ${temporary}`)
try {
  const workspace = createWorkspace(temporary, ['vue-lib'])
  const cli = args => run(process.execPath, [path.join(workspace, 'node_modules/repoctl/bin/repoctl.js'), ...args], workspace)
  const vue = path.join(workspace, 'packages/vue-lib')
  const react = [18, 19].map(major => createReactLibrary(workspace, major))
  run('pnpm', ['install', '--ignore-scripts', '--no-frozen-lockfile', '--registry', registry], workspace)
  run('pnpm', ['build'], workspace)
  const before = new Map([vue, ...react].map((library, index) => [library, { manifest: readFileSync(path.join(library, 'package.json'), 'utf8'), contents: packContents(library, path.join(temporary, `before-${index}`)) }]))
  const cases = [
    { framework: 'vue', library: vue, component: 'HelloWorld', example: { kind: 'prop-update', prop: 'msg', initial: 'Hello Storybook', updated: 'Updated component' }, defaultText: 'Hello Storybook', alternateText: 'Updated component', resultText: 'Updated component' },
    ...react.map(library => ({ framework: 'react', library, component: 'Counter', example: { kind: 'click', args: { initialCount: 0 }, alternateArgs: { initialCount: 4 }, click: { role: 'button', name: 'Increase' }, expectText: '1' }, defaultText: '0', alternateText: '4', resultText: '1' })),
  ]
  const plans = []
  for (const item of cases) {
    const exampleFile = `${item.framework}-example.json`
    writeJson(path.join(workspace, exampleFile), item.example)
    const plan = JSON.parse(cli(['tooling', 'capability', 'plan', 'storybook', '--target', json(path.join(item.library, 'package.json')).name, '--framework', item.framework, '--component', item.component, '--example', exampleFile, '--json']))
    assert.equal(plan.status, 'ready')
    assert.equal(existsSync(path.join(workspace, plan.workspace.directory)), false)
    const filename = `${item.framework}-plan.json`
    writeJson(path.join(workspace, filename), plan)
    const apply = ['tooling', 'capability', 'apply', filename, '--json']
    assert.equal(JSON.parse(cli(apply)).status, 'applied')
    assert.equal(JSON.parse(cli(apply)).status, 'unchanged')
    plans.push({ ...item, plan, directory: path.join(workspace, plan.workspace.directory) })
  }
  assert.equal(json(path.join(workspace, 'package.json')).scripts['test:packaged-storybook'], undefined)
  run('pnpm', ['install', '--ignore-scripts', '--no-frozen-lockfile', '--registry', registry], workspace)
  for (const command of ['build', 'build:storybook', 'lint', 'typecheck', 'tsd', 'test']) {
    console.log(`Generated Storybook workspace: ${command}`)
    console.log(run('pnpm', [command], workspace))
  }
  run('pnpm', ['--filter', plans[0].plan.workspace.name, 'test:storybook:install'], workspace)
  console.log(run('pnpm', ['test:storybook'], workspace))
  for (const [index, item] of plans.entries()) {
    assert.equal(readFileSync(path.join(item.library, 'package.json'), 'utf8'), before.get(item.library).manifest)
    assert.deepEqual(packContents(item.library, path.join(temporary, `after-${index}`)), before.get(item.library).contents)
    await checkStorybookBrowser(item)
    await checkStorybookLifecycle(item)
    const ownedStory = path.join(item.directory, 'stories/team.stories.ts')
    writeFileSync(ownedStory, 'export const Team = {}\n')
    const fresh = JSON.parse(cli(['tooling', 'capability', 'plan', 'storybook', '--target', item.plan.target.name, '--framework', item.framework, '--component', item.component, '--example', `${item.framework}-example.json`, '--json']))
    assert.equal(fresh.status, 'unchanged')
    assert.equal(readFileSync(ownedStory, 'utf8'), 'export const Team = {}\n')
  }
  console.log('Packaged Storybook passed: Vue/React static stories, real play interactions, failure/interruption cleanup, idempotency and unchanged library tarballs.')
}
finally {
  rmSync(temporary, { recursive: true, force: true })
  assert.equal(existsSync(temporary), false)
}
