import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { prepareMaintenanceUpgrade } from '@icebreakers/monorepo'
import { expect, it } from 'vitest'
import { presetBytes, presetFixture, presetName, presetTarget } from './preset-fixture'

it.each([false, true])('upgrades configured presets once and preserves customization; duplicate references: %s', async (duplicate) => {
  const h = await presetFixture({ extra: true, duplicate })
  const report = await prepareMaintenanceUpgrade(h.options)
  expect(report.status, report.errors.join()).toBe('ready')
  expect(report.versions.status).toBe('unchanged')
  expect(report.plan).toBeNull()
  expect(report.presets?.versions).toMatchObject([{ packageName: presetName, status: 'changed', from: '1.0.0', to: '2.0.0' }])
  expect(report.presets?.versions).toHaveLength(1)
  expect(report.presets?.skipped).toEqual(['scripts/new-standard.mjs'])
  expect(report.files.map(file => file.path).sort()).toEqual([h.baselinePath, presetTarget].sort())
  expect(await readFile(path.join(h.cwd, presetTarget), 'utf8')).toBe(presetBytes.replace('first = 1', 'first = 10').replace('fourth = 4', 'fourth = 40'))
  await expect(readFile(path.join(h.cwd, 'scripts/new-standard.mjs'))).rejects.toMatchObject({ code: 'ENOENT' })
  expect(report.checks.map(check => check.name)).toEqual(['lockfile', 'install', 'build', 'lint', 'typecheck', 'tsd', 'test'])
  h.commit('merge maintenance')
  h.calls.length = 0
  const repeat = await prepareMaintenanceUpgrade({ ...h.options, head: h.git(['rev-parse', 'HEAD']), outputDirectory: path.join(h.root, 'repeat') })
  expect(repeat.status, repeat.errors.join()).toBe('unchanged')
  expect(h.calls).toEqual([])
})

it.each([false, true])('plans root and preset upgrades together, including root manifest changes: %s', async (mixedManifest) => {
  const h = await presetFixture({ mixed: true, mixedManifest })
  const report = await prepareMaintenanceUpgrade(h.options)
  expect(report.status, report.errors.join()).toBe('ready')
  expect(report.versions.status).toBe('changed')
  if (mixedManifest) {
    expect(report.files.map(file => file.path)).toContain('package.json')
  }
  expect(report.files.map(file => file.path)).toEqual(expect.arrayContaining(['.editorconfig', presetTarget, h.baselinePath]))
})

it('avoids validation and PRs for unchanged preset bytes or unrelated dependency updates', async () => {
  const h = await presetFixture({ sameBytes: true })
  const report = await prepareMaintenanceUpgrade(h.options)
  expect(report.status, report.errors.join()).toBe('unchanged')
  expect(h.calls).toEqual([])
  expect(h.git(['status', '--porcelain'])).toBe('')
  const unrelated = await prepareMaintenanceUpgrade({ ...h.options, base: h.head, outputDirectory: path.join(h.root, 'unrelated') })
  expect(unrelated.status, unrelated.errors.join()).toBe('unchanged')
  expect(unrelated.presets?.plan).toBeNull()
  expect(h.calls).toEqual([])
  // No-op version changes preserve the older content baseline for the next real update.
  await h.install('3.0.0', presetBytes.replace('first = 1', 'first = 30'), h.version)
  const head = h.commit('next substantive preset')
  const next = await prepareMaintenanceUpgrade({ ...h.options, base: h.head, head, outputDirectory: path.join(h.root, 'next') })
  expect(next.status, next.errors.join()).toBe('ready')
})

it('blocks conflicting preset edits before root assets or scripts change', async () => {
  const h = await presetFixture({ conflict: true, mixed: true })
  const report = await prepareMaintenanceUpgrade(h.options)
  expect(report.status).toBe('blocked')
  expect(report.presets?.plan?.conflicts).toHaveLength(1)
  expect(report.patchHash).toBeNull()
  expect(h.calls).toEqual([])
  expect(h.git(['status', '--porcelain'])).toBe('')
  await expect(readFile(path.join(h.cwd, '.editorconfig'))).rejects.toMatchObject({ code: 'ENOENT' })
})

it.each(['range', 'lock', 'installed', 'source', 'removal', 'unconfigured'])('blocks %s preset identity changes without running checks', async (kind) => {
  const h = await presetFixture()
  if (kind === 'range') {
    const manifest = JSON.parse(await readFile(path.join(h.cwd, 'package.json'), 'utf8'))
    manifest.devDependencies[presetName] = '^2.0.0'
    await h.json('package.json', manifest)
  }
  else if (kind === 'lock') {
    const file = path.join(h.cwd, 'pnpm-lock.yaml')
    await h.write('pnpm-lock.yaml', (await readFile(file, 'utf8')).replace('version: 2.0.0', 'version: link:../outside'))
  }
  else if (kind === 'installed') {
    await h.json(`node_modules/${presetName}/package.json`, { name: presetName, version: '3.0.0' })
  }
  else if (kind === 'removal' || kind === 'unconfigured') {
    const manifest = JSON.parse(await readFile(path.join(h.cwd, 'package.json'), 'utf8'))
    if (kind === 'removal') {
      delete manifest.devDependencies[presetName]
    }
    await h.json('package.json', manifest)
    await h.write('repoctl.config.mjs', 'export default {}\n')
  }
  else {
    await h.json(`node_modules/${presetName}/repoctl.preset.json`, { schemaVersion: 1, requires: { repoctl: '>=5 <6' }, assets: [{ source: 'assets/new.mjs', target: presetTarget }] })
  }
  const head = ['range', 'lock', 'removal', 'unconfigured'].includes(kind) ? h.commit('invalid identity') : h.head
  const report = await prepareMaintenanceUpgrade({ ...h.options, head })
  expect(report.status).toBe('blocked')
  expect(report.errors.length).toBeGreaterThan(0)
  expect(h.calls).toEqual([])
})

it('retains a failed preset validation report without publishing a patch', async () => {
  const h = await presetFixture()
  const original = h.options.spawn!
  const report = await prepareMaintenanceUpgrade({ ...h.options, spawn: ((command, args, settings) => {
    const result = original(command, args as readonly string[], settings as never)
    return args?.includes('test') ? { ...result, status: 1 } : result
  }) as typeof original })
  expect(report.status).toBe('blocked')
  expect(report.checks.at(-1)).toMatchObject({ name: 'test', status: 'failed' })
  expect(report.patchHash).toBeNull()
})

it('requires explicit adoption for a newly introduced preset dependency', async () => {
  const h = await presetFixture()
  const report = await prepareMaintenanceUpgrade({ ...h.options, base: h.git(['rev-parse', `${h.base}^`]) })
  expect(report.status).toBe('blocked')
  expect(report.errors.join()).toContain('installation or removal')
  expect(h.calls).toEqual([])
})

it('blocks root changes that alter preset selection instead of accepting a different replan', async () => {
  const h = await presetFixture({ mixed: true, mixedManifest: true })
  const configuration = { presets: [{ packageName: presetName, version: '2.0.0' }], commands: { upgrade: { targets: ['package.json', '.editorconfig'], mergeTargets: false } } }
  await h.write('repoctl.config.mjs', `import { readFileSync } from 'node:fs'\nconst manifest = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))\nconst config = ${JSON.stringify(configuration)}\nexport default { ...config, presets: manifest.packageManager ? [] : config.presets }\n`)
  const head = h.commit('configuration depends on root manifest')
  const baseline = await readFile(path.join(h.cwd, h.baselinePath), 'utf8')
  const asset = await readFile(path.join(h.cwd, presetTarget), 'utf8')
  const report = await prepareMaintenanceUpgrade({ ...h.options, head })
  expect(report.status).toBe('blocked')
  expect(report.patchHash).toBeNull()
  expect(report.errors.join()).toMatch(/preset.*(?:changed|no longer declared)/i)
  expect(await readFile(path.join(h.cwd, h.baselinePath), 'utf8')).toBe(baseline)
  expect(await readFile(path.join(h.cwd, presetTarget), 'utf8')).toBe(asset)
  expect(h.calls).toEqual([])
})
