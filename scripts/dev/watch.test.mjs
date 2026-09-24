import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import process from 'node:process'
import { it } from 'vitest'
import { temporaryWorkspace, waitFor } from './workspace.mjs'

const turbo = createRequire(import.meta.url).resolve('turbo/bin/turbo')
const manifest = JSON.parse(await readFile(new URL('../../package.json', import.meta.url), 'utf8'))

it('watch builds cold dependencies, propagates updates, blocks failed dependents and cleans up', { timeout: 120_000, skip: process.platform === 'win32' }, async (t) => {
  const cwd = await temporaryWorkspace(t)
  await writeFile(path.join(cwd, 'package.json'), JSON.stringify({ name: 'dev-fixture', private: true, packageManager: manifest.packageManager }))
  await writeFile(path.join(cwd, 'pnpm-workspace.yaml'), 'packages:\n  - packages/*\n')
  await writeFile(path.join(cwd, '.gitignore'), 'node_modules\n.turbo\ndist\nrunning.pid\n')
  await copyFile(new URL('../../turbo.json', import.meta.url), path.join(cwd, 'turbo.json'))
  await copyFile(new URL('./fixtures/build.mjs', import.meta.url), path.join(cwd, 'build.mjs'))
  for (const name of ['upstream', 'repoctl']) {
    await mkdir(path.join(cwd, 'packages', name, 'src'), { recursive: true })
    await writeFile(path.join(cwd, 'packages', name, 'package.json'), JSON.stringify({
      name,
      version: '1.0.0',
      scripts: { build: 'node ../../build.mjs' },
      ...(name === 'repoctl' ? { dependencies: { upstream: 'workspace:*' } } : {}),
    }))
  }
  const source = path.join(cwd, 'packages/upstream/src/value.txt')
  const outputFile = path.join(cwd, 'packages/repoctl/dist/value.txt')
  await writeFile(source, 'first')
  execFileSync('git', ['init', '--quiet'], { cwd })
  execFileSync('pnpm', ['install', '--ignore-scripts', '--offline'], { cwd, stdio: 'pipe' })

  const watchArgs = manifest.scripts['dev:repoctl'].split(' && ').at(-1).split(' ').slice(1)
  const child = spawn(process.execPath, [turbo, ...watchArgs, '--ui=stream'], { cwd, detached: true, stdio: ['ignore', 'pipe', 'pipe'] })
  let logs = ''
  let finished = false
  let buildPid
  child.stdout.on('data', data => logs += data)
  child.stderr.on('data', data => logs += data)
  child.on('exit', () => finished = true)
  child.on('error', error => logs += error.message)
  t.onTestFinished(() => {
    try {
      process.kill(-child.pid, 'SIGKILL')
    }
    catch {}
    if (buildPid) {
      try {
        process.kill(buildPid, 'SIGKILL')
      }
      catch {}
    }
  })
  const output = () => logs
  const value = () => readFile(outputFile, 'utf8').catch(() => '')
  await waitFor(async () => await value() === 'first', 'cold dependency build', output)
  assert.ok(logs.indexOf('BUILT upstream first') < logs.indexOf('BUILT repoctl first'))

  await writeFile(source, 'second')
  await waitFor(async () => await value() === 'second', 'downstream update', output)
  await writeFile(source, 'broken')
  await waitFor(() => logs.includes('INTENTIONAL_BUILD_FAILURE'), 'upstream failure', output)
  assert.equal(await value(), 'second')
  await writeFile(source, 'recovered')
  await waitFor(async () => await value() === 'recovered', 'recovery after build error', output)

  await writeFile(source, 'slow')
  await waitFor(async () => {
    buildPid = Number(await readFile(path.join(cwd, 'running.pid'), 'utf8').catch(() => ''))
    return buildPid > 0
  }, 'active child build', output)
  // A terminal sends Ctrl+C to the foreground process group, including pnpm.
  process.kill(-child.pid, 'SIGINT')
  await waitFor(() => finished, 'watch shutdown', output)
  await waitFor(() => {
    try {
      process.kill(buildPid, 0)
      return false
    }
    catch {
      return true
    }
  }, 'child build shutdown', output)
})
