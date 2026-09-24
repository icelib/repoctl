import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { it } from 'vitest'
// Exercise the delivery artifacts after building, including the asset sync pipeline.
// eslint-disable-next-line antfu/no-import-dist
import { prepareAssets, scaffoldWorkspace } from '../../packages/monorepo-templates/dist/index.mjs'
import { temporaryWorkspace } from './workspace.mjs'

const root = fileURLToPath(new URL('../../', import.meta.url))
const turbo = createRequire(import.meta.url).resolve('turbo/bin/turbo')
const manifest = JSON.parse(await readFile(new URL('../../package.json', import.meta.url), 'utf8'))

it('package profiles select their dependency closures without starting template servers', () => {
  for (const profile of ['repoctl', 'create', 'configs', 'packages']) {
    const command = manifest.scripts[`dev:${profile}`].split(' && ').at(-1)
    assert.ok(command.startsWith('turbo watch build '))
    const filters = command.match(/--filter=[^\s"]+/g)
    const graph = JSON.parse(execFileSync(process.execPath, [turbo, 'run', 'build', ...filters, '--dry=json'], { cwd: root, encoding: 'utf8' }))
    const packages = graph.tasks.map(task => task.package)
    assert.ok(graph.tasks.length > 0)
    assert.ok(graph.tasks.every(task => task.directory.startsWith('packages/')))
    if (profile === 'repoctl') {
      const tasks = new Map(graph.tasks.map(task => [task.taskId, task]))
      assert.ok(tasks.get('repoctl#build').dependencies.includes('@icebreakers/monorepo#build'))
      assert.ok(tasks.get('@icebreakers/stylelint-config#build').dependencies.includes('stylelint-plugin-tailwindcss#build'))
      assert.ok(tasks.has('postcss-tailwindcss#build'))
      assert.ok(!tasks.has('create-repoctl#build'))
    }
    if (profile === 'create') {
      assert.deepEqual(packages.sort(), ['@icebreakers/monorepo-templates', 'create-icebreaker', 'create-repoctl'])
    }
    if (profile === 'configs') {
      assert.ok(!packages.includes('repoctl'))
      assert.ok(packages.includes('postcss-tailwindcss'))
    }
    if (profile === 'packages') {
      assert.ok(graph.packages.includes('lightningcss-tailwindcss'))
      assert.ok(graph.packages.includes('@icebreakers/changelog-github'))
      assert.ok(graph.packages.includes('create-icebreaker'))
    }
  }
})

it('template services have independent entrypoints and dependency build gates', () => {
  for (const [profile, name] of [['client', 'client'], ['server', 'server'], ['docs', 'website']]) {
    const command = manifest.scripts[`dev:${profile}`]
    assert.ok(command.startsWith('pnpm run tooling:build && '))
    const graph = JSON.parse(execFileSync(process.execPath, [turbo, 'run', 'dev', `--filter=@icebreakers/${name}`, '--dry=json'], { cwd: root, encoding: 'utf8' }))
    assert.deepEqual(graph.tasks.filter(task => task.task === 'dev').map(task => task.package), [`@icebreakers/${name}`])
  }
})

it('built scaffold output receives portable dev scripts instead of source profiles', async (t) => {
  const directory = await temporaryWorkspace(t)
  await prepareAssets()
  await scaffoldWorkspace({ targetDir: directory, templateKeys: [], includeAssets: true })
  const published = JSON.parse(await readFile(`${directory}/package.json`, 'utf8'))
  assert.equal(published.scripts.dev, 'turbo run dev --concurrency=20')
  assert.ok(!Object.keys(published.scripts).some(name => name.startsWith('dev:')))
  assert.ok(!JSON.stringify(published.scripts).includes('test:dev-scenarios'))
  assert.ok(!('test:packaged-create' in published.scripts))
  assert.equal(published.scripts['test:dev'], manifest.scripts['test:dev'])
  const config = JSON.parse(await readFile(`${directory}/turbo.json`, 'utf8'))
  assert.deepEqual(config.tasks.dev.dependsOn, ['^build'])
  assert.equal(config.tasks.dev.persistent, true)
})
