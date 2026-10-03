import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { c } from 'tar'
import { expect, it } from 'vitest'
import { write } from '../../commands/template-instances/fixtures'
import { exists, npmFixture } from '../../commands/template-sources/fixtures'
import { fixture, loadRepo, manifest, snapshot } from './fixture'

it('creates parameterized preset templates with exact remote identity and secret exclusions', async () => {
  const repo = await loadRepo()
  const f = await npmFixture()
  const ref = { packageName: '@fixtures/templates', version: '1.2.3' }
  const remote = { kind: 'npm' as const, ...ref }
  const preset = { ...manifest, templates: { 'team.sdk': { source: 'templates/sample', target: 'packages/sdk' } } }
  await write(f.cwd, 'package.json', JSON.stringify({ name: 'consumer', private: true, devDependencies: { [ref.packageName]: ref.version } }))
  await write(f.cwd, `node_modules/${ref.packageName}/package.json`, JSON.stringify({ name: ref.packageName, version: ref.version, main: 'index.cjs' }))
  await write(f.cwd, `node_modules/${ref.packageName}/index.cjs`, 'throw new Error("Preset JavaScript must never execute")\n')
  await write(f.cwd, `node_modules/${ref.packageName}/repoctl.preset.json`, JSON.stringify(preset))
  await write(f.cwd, '.npmrc', `${await readFile(path.join(f.cwd, '.npmrc'), 'utf8')}@fixtures:registry=${f.remote.registry}\n`)
  await write(f.cwd, 'repoctl.config.mjs', `export default ${JSON.stringify({ presets: [ref], commands: { create: { cacheDir: f.cacheDir } } })}\n`)
  await write(f.packageDir, 'templates/sample/repoctl.template.json', JSON.stringify({
    schemaVersion: 1,
    parameters: { label: { type: 'string', required: true }, token: { type: 'string', required: true, sensitive: true } },
    interpolate: ['index.js', 'credentials.local'],
  }))
  await write(f.packageDir, 'templates/sample/index.js', 'export const label = {{repoctl-json:label}}\n')
  await write(f.packageDir, 'templates/sample/credentials.local', 'TOKEN={{repoctl:token}}\n')
  const archive = path.join(f.root, 'package.tgz')
  await c({ file: archive, gzip: true, cwd: f.root }, ['package'])
  f.state.bytes = await readFile(archive)
  f.state.integrity = `sha512-${createHash('sha512').update(f.state.bytes).digest('base64')}`

  const catalog = await repo.resolveTemplateCatalog({ cwd: f.cwd })
  expect(catalog.entries.find(entry => entry.key === 'team.sdk')).toMatchObject({ preset: ref, remote })
  expect(f.state.requests).toBe(0)
  await repo.resolveRemoteTemplateSource(remote, 'templates/sample', { cwd: f.cwd, cacheDir: f.cacheDir })
  const requests = f.state.requests
  f.state.rejectAuth = true
  const before = await snapshot(f.cwd)
  const secret = 'preset-parameter-secret-924'
  const plan = await repo.resolveCreateNewProjectPlan({ cwd: f.cwd, type: 'team.sdk', name: 'packages/sdk', offline: true, parameters: { label: 'team-sdk', token: secret } })
  const identity = { kind: 'npm', packageName: ref.packageName, requestedVersion: ref.version, version: ref.version, registry: f.remote.registry, integrity: f.state.integrity }
  expect(plan.sourceResolution?.resolved).toEqual(identity)
  expect(plan.parameterization?.values).toEqual({ label: 'team-sdk', token: '[redacted]' })
  expect(JSON.stringify(plan)).not.toContain(secret)
  expect(await snapshot(f.cwd)).toEqual(before)

  await repo.applyCreateNewProjectPlan(plan, false)
  expect(await readFile(path.join(f.cwd, 'packages/sdk/index.js'), 'utf8')).toBe('export const label = "team-sdk"\n')
  expect(await readFile(path.join(f.cwd, 'packages/sdk/credentials.local'), 'utf8')).toBe(`TOKEN=${secret}\n`)
  const [record] = await repo.listTemplateInstances(f.cwd)
  expect(record?.instance.source).toEqual({ kind: 'remote', templatePath: 'templates/sample', digest: expect.stringMatching(/^[a-f0-9]{64}$/u), remote: identity })
  expect(record?.instance.parameters).toMatchObject({ templateValues: { label: 'team-sdk' }, sensitiveParameters: ['token'] })
  expect(record?.instance.parameters.templateValues).not.toHaveProperty('token')
  expect(record?.instance.excludedPaths).toEqual(['credentials.local'])
  const metadata = JSON.stringify(await snapshot(path.join(f.cwd, '.repoctl')))
  expect(metadata).not.toContain(secret)
  expect(metadata).not.toContain(Buffer.from(`TOKEN=${secret}\n`).toString('base64'))
  expect(f.state.requests).toBe(requests)
  expect(await exists(f.scriptMarker)).toBe(false)
})

it.each(['parameters', 'parameterPrompt'])('rejects persistent %s in both preset and project configuration', async (field) => {
  const repo = await loadRepo()
  const h = await fixture()
  const value = field === 'parameters' ? { label: 'private-persistent-value' } : 'private-persistent-value'
  const ref = await h.install('@team/base', { ...manifest, config: { commands: { create: { [field]: value } } } })
  const beforePreset = await snapshot(h.root)
  const resolution = await repo.resolveOrganizationPresets(h.root, [ref])
  expect(resolution.diagnostics).toContainEqual(expect.objectContaining({ id: 'preset.invalid-manifest' }))
  expect(JSON.stringify(resolution)).not.toContain('private-persistent-value')
  expect(await snapshot(h.root)).toEqual(beforePreset)

  await h.install('@team/base')
  const expression = field === 'parameters' ? JSON.stringify(value) : 'async () => "private-persistent-value"'
  await writeFile(path.join(h.root, 'repoctl.config.mjs'), `export default { presets: ${JSON.stringify([ref])}, commands: { create: { ${field}: ${expression} } } }\n`)
  const beforeProject = await snapshot(h.root)
  await expect(repo.loadMonorepoConfigDetails(h.root, { refresh: true })).rejects.toMatchObject({
    diagnostics: [expect.objectContaining({ id: 'config.unknown-field', path: `commands.create.${field}` })],
  })
  expect(await snapshot(h.root)).toEqual(beforeProject)
})
