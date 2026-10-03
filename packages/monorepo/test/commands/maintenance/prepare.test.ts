import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { prepareMaintenanceUpgrade } from '@icebreakers/monorepo'
import { expect, it } from 'vitest'
import { digest, fixture, lockfile } from './fixture'

it('prepares exact root assets and baseline bytes with ordered checks and an applicable patch', async () => {
  const h = await fixture()
  const report = await prepareMaintenanceUpgrade(h.options)
  expect(report.status, JSON.stringify(report.errors)).toBe('ready')
  expect(report.versions).toMatchObject({ from: '0.1.0', to: h.version, status: 'changed' })
  expect(report.files.map(file => file.path)).toContain('.editorconfig')
  expect(report.files.some(file => file.path.startsWith('.repoctl/baselines/root/'))).toBe(true)
  expect(report.checks.map(check => check.name)).toEqual(['lockfile', 'install', 'build', 'lint', 'typecheck', 'tsd', 'test'])
  expect(h.calls.slice(0, 2).every(call => call.includes('--ignore-scripts'))).toBe(true)
  const patch = await readFile(path.join(h.options.outputDirectory, 'changes.patch'))
  expect(digest(patch)).toBe(report.patchHash)
  expect(h.git(['diff', '--cached', '--name-only'])).toBe('')
  const clone = path.join(h.root, 'consumer')
  h.git(['clone', '-q', '--no-hardlinks', h.cwd, clone], h.root)
  h.git(['apply', '--check', path.join(h.options.outputDirectory, 'changes.patch')], clone)
  h.git(['apply', path.join(h.options.outputDirectory, 'changes.patch')], clone)
  expect(await readFile(path.join(clone, '.editorconfig'), 'utf8')).toBe(await readFile(path.join(h.cwd, '.editorconfig'), 'utf8'))
})

it('does not plan or run scripts for an unrelated dependency update', async () => {
  const h = await fixture()
  const report = await prepareMaintenanceUpgrade({ ...h.options, base: h.head })
  expect(report.status).toBe('unchanged')
  expect(report.plan).toBeNull()
  expect(h.calls).toEqual([])
})

it('does not prepare another patch when the same version change already has synchronized assets', async () => {
  const h = await fixture()
  expect((await prepareMaintenanceUpgrade(h.options)).status).toBe('ready')
  h.git(['add', '.'])
  h.git(['-c', 'commit.gpgsign=false', 'commit', '-qm', 'synchronize assets'])
  h.calls.length = 0
  const report = await prepareMaintenanceUpgrade({ ...h.options, head: h.git(['rev-parse', 'HEAD']), outputDirectory: path.join(h.root, 'repeat') })
  expect(report.status, report.errors.join()).toBe('unchanged')
  expect(report.files).toEqual([])
  expect(h.calls).toEqual([])
})

it('retains failed validation as a report without a publishable patch', async () => {
  const h = await fixture()
  const original = h.options.spawn!
  const report = await prepareMaintenanceUpgrade({ ...h.options, spawn: ((command, args, settings) => {
    const result = original(command, args as readonly string[], settings as never)
    return args?.includes('lint') ? { ...result, status: 1, stderr: 'fixture lint failed' } : result
  }) as typeof original })
  expect(report.status).toBe('blocked')
  expect(report.checks.at(-1)).toMatchObject({ name: 'lint', status: 'failed' })
  expect(report.patchHash).toBeNull()
  expect(JSON.parse(await readFile(path.join(h.options.outputDirectory, 'report.json'), 'utf8')).status).toBe('blocked')
})

it('blocks unsupported lockfile evidence before executing validation', async () => {
  const h = await fixture()
  await h.write('pnpm-lock.yaml', lockfile('link:../tool'))
  h.git(['add', '.'])
  h.git(['-c', 'commit.gpgsign=false', 'commit', '-qm', 'unsupported tool'])
  const report = await prepareMaintenanceUpgrade({ ...h.options, head: h.git(['rev-parse', 'HEAD']) })
  expect(report.status).toBe('blocked')
  expect(report.versions.reason).toContain('exact registry')
  expect(h.calls).toEqual([])
})

it('rejects changes introduced by verification outside the asset plan', async () => {
  const h = await fixture()
  const original = h.options.spawn!
  const report = await prepareMaintenanceUpgrade({ ...h.options, spawn: ((command, args, settings) => {
    if (args?.includes('lint')) {
      h.git(['config', 'core.commentChar', '#'])
      h.git(['update-index', '--add', '--cacheinfo', `100644,${h.git(['hash-object', 'package.json'])},unrelated.json`])
    }
    return original(command, args as readonly string[], settings as never)
  }) as typeof original })
  expect(report.status).toBe('blocked')
  expect(report.errors.join()).toContain('outside the upgrade plan')
})

it('rejects a target version different from the installed tool', async () => {
  const h = await fixture()
  await writeFile(path.join(h.cwd, 'pnpm-lock.yaml'), lockfile('99.0.0'))
  h.git(['add', '.'])
  h.git(['-c', 'commit.gpgsign=false', 'commit', '-qm', 'future tool'])
  const report = await prepareMaintenanceUpgrade({ ...h.options, head: h.git(['rev-parse', 'HEAD']) })
  expect(report.status).toBe('blocked')
  expect(report.errors.join()).toContain('exact target')
})
