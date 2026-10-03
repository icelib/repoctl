import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { fork } from 'node:child_process'
import { once } from 'node:events'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import YAML from 'yaml'
import { archiveFixturePackage } from '../packaged-template/archive.mjs'
import { createWorkspace, json, registry, run, writeJson } from '../packaged-template/workspace.mjs'

const root = mkdtempSync(path.join(tmpdir(), 'repoctl-packaged-presets-'))
const parameterSecret = 'preset-parameter-private-input-984'
function assertNoParameterSecret(value) {
  if (typeof value === 'string') {
    assert.ok(!value.includes(parameterSecret))
    assert.ok(!Buffer.from(value, 'base64').toString('utf8').includes(parameterSecret))
  }
  else if (value && typeof value === 'object') {
    Object.values(value).forEach(assertNoParameterSecret)
  }
}
function inspectMetadata(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      inspectMetadata(filename)
    }
    else {
      assertNoParameterSecret(JSON.parse(readFileSync(filename, 'utf8')))
    }
  }
}
let server
try {
  const source = path.join(root, 'preset')
  const packs = path.join(root, 'preset-packs')
  mkdirSync(source)
  mkdirSync(packs)
  mkdirSync(path.join(source, 'templates/sdk'), { recursive: true })
  mkdirSync(path.join(source, 'assets'))
  const marker = path.join(root, 'unexpected-preset-execution')
  const entry = `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'unexpected')\n`
  writeFileSync(path.join(source, 'entry.cjs'), entry)
  const metadata = {
    name: '@fixture/templates',
    version: '1.2.3',
    type: 'module',
    exports: { '.': './entry.cjs' },
    files: ['entry.cjs', 'repoctl.preset.json', 'assets', 'templates'],
    scripts: { prepare: 'node entry.cjs', postinstall: 'node entry.cjs' },
  }
  const preset = {
    schemaVersion: 1,
    requires: { repoctl: '>=5 <6' },
    config: { commands: { ai: { baseDir: 'organization', force: true }, clean: { includePrivate: false } } },
    templates: { 'org-sdk': { source: 'templates/sdk', target: 'packages/sdk', label: 'Organization SDK', category: 'library' } },
    capabilities: [{ id: 'playwright', reason: 'Browser coverage' }, { id: 'storybook', reason: 'Component documentation' }],
    assets: [{ source: 'assets/check.mjs', target: 'scripts/organization-check.mjs' }],
  }
  writeJson(path.join(source, 'package.json'), metadata)
  writeJson(path.join(source, 'repoctl.preset.json'), preset)
  writeJson(path.join(source, 'templates/sdk/package.json'), { name: '@fixture/sdk', type: 'module', version: '0.0.0', main: './index.js' })
  writeFileSync(path.join(source, 'templates/sdk/index.js'), 'export const answer = 42\nexport const label = {{repoctl-json:label}}\n')
  writeFileSync(path.join(source, 'templates/sdk/credentials.local'), 'TOKEN={{repoctl:token}}\n')
  writeJson(path.join(source, 'templates/sdk/repoctl.template.json'), { schemaVersion: 1, parameters: { label: { type: 'string', required: true }, token: { type: 'string', required: true, sensitive: true } }, interpolate: ['index.js', 'credentials.local'] })
  const baseAsset = 'export const first = 1\nexport const second = 2\nexport const third = 3\nexport const fourth = 4\n'
  writeFileSync(path.join(source, 'assets/check.mjs'), baseAsset)
  const archive = archiveFixturePackage(source, path.join(packs, 'fixture-templates-1.2.3.tgz'), ['package.json', 'entry.cjs', 'repoctl.preset.json', 'assets/check.mjs', 'templates/sdk/package.json', 'templates/sdk/index.js', 'templates/sdk/credentials.local', 'templates/sdk/repoctl.template.json'])
  assert.ok(!existsSync(marker), 'Fixture archive construction must not execute preset scripts')
  server = fork(path.join(import.meta.dirname, '../template-sources/registry.mjs'), [archive], { stdio: ['ignore', 'inherit', 'inherit', 'ipc'] })
  const [{ port }] = await once(server, 'message')
  const registryUrl = `http://127.0.0.1:${port}/`
  const cacheDir = path.join(root, 'template-cache')
  const workspaces = []
  for (const name of ['first', 'second']) {
    const parent = path.join(root, name)
    mkdirSync(parent)
    const workspace = createWorkspace(parent, [])
    workspaces.push(workspace)
    assert.equal(json(path.join(workspace, 'package.json')).scripts['test:packaged-presets'], undefined)
    assert.ok(!readFileSync(path.join(workspace, '.github/workflows/ci.yml'), 'utf8').includes('test:packaged-presets'))
    const packageFile = path.join(workspace, 'package.json')
    const packageJson = json(packageFile)
    packageJson.devDependencies['@fixture/templates'] = '1.2.3'
    writeJson(packageFile, packageJson)
    const workspaceFile = path.join(workspace, 'pnpm-workspace.yaml')
    const workspaceConfig = YAML.parse(readFileSync(workspaceFile, 'utf8'))
    workspaceConfig.overrides['@fixture/templates'] = `file:${archive}`
    writeFileSync(workspaceFile, YAML.stringify(workspaceConfig))
    run('pnpm', ['install', '--no-frozen-lockfile', '--ignore-scripts', '--registry', registry], workspace)
    assert.ok(!existsSync(marker), 'Installing the fixture must not execute preset scripts')
    writeFileSync(path.join(workspace, '.npmrc'), `@fixture:registry=${registryUrl}\n//127.0.0.1:${port}/:_authToken=packaged-template-secret\n`)
    const configuration = {
      presets: [{ packageName: '@fixture/templates', version: '1.2.3' }],
      commands: { create: { cacheDir }, ...(name === 'first' ? { ai: { force: false } } : {}) },
    }
    writeFileSync(path.join(workspace, 'repoctl.config.ts'), `export default ${JSON.stringify(configuration)}\n`)
    const cli = path.join(workspace, 'node_modules/repoctl/bin/repoctl.js')
    const invoke = args => run(process.execPath, [cli, ...args], workspace)
    const report = JSON.parse(invoke(['config', 'inspect', '--command', 'ai', '--json']))
    assert.equal(report.effective.values.force, name !== 'first')
    assert.equal(report.effective.sources.baseDir.packageName, '@fixture/templates')
    const overridden = JSON.parse(invoke(['config', 'inspect', '--command', 'ai', '--set', 'force=false', '--json']))
    assert.equal(overridden.effective.values.force, false)
    assert.equal(overridden.effective.sources.force.kind, 'cli')
    const full = JSON.parse(invoke(['config', 'inspect', '--json']))
    assert.deepEqual(full.capabilities.map(item => item.id), ['playwright', 'storybook'])
    const catalog = JSON.parse(invoke(['templates', '--json']))
    const template = catalog.find(item => item.key === 'org-sdk')
    assert.deepEqual(template.remote, { kind: 'npm', packageName: '@fixture/templates', version: '1.2.3' })
    assert.equal(template.preset.packageName, '@fixture/templates')
    assert.ok(!existsSync(cacheDir))
    assert.ok(!existsSync(path.join(workspace, 'scripts/organization-check.mjs')))
    assert.ok(!existsSync(marker))
    assert.ok(!existsSync(path.join(workspace, 'e2e')))
    assert.ok(!existsSync(path.join(workspace, 'stories')))
    assert.throws(() => invoke(['new', 'sdk', '--template', 'org-sdk', '--offline', '--json']))
    const plan = JSON.parse(invoke(['presets', 'plan', '--json', '--out', 'preset-plan.json']))
    assert.equal(plan.status, 'ready')
    invoke(['presets', 'apply', 'preset-plan.json'])
    assert.equal(readFileSync(path.join(workspace, 'scripts/organization-check.mjs'), 'utf8'), baseAsset)
    assert.equal(JSON.parse(invoke(['presets', 'apply', 'preset-plan.json', '--json'])).status, 'unchanged')
    assert.ok(!existsSync(marker))
  }
  const first = workspaces[0]
  const second = workspaces[1]
  const firstCli = path.join(first, 'node_modules/repoctl/bin/repoctl.js')
  const fetched = JSON.parse(run(process.execPath, [firstCli, 'templates', 'fetch', 'org-sdk', '--json'], first))
  assert.equal(fetched.resolved.version, '1.2.3')
  server.kill('SIGTERM')
  await once(server, 'exit')
  server = undefined
  const data = path.join(root, 'parameters.json')
  writeJson(data, { label: 'Organization SDK', token: parameterSecret })
  const createArgs = [firstCli, 'new', 'sdk', '--template', 'org-sdk', '--offline', '--data', data]
  const preview = JSON.parse(run(process.execPath, [...createArgs, '--json'], first))
  assert.equal(preview.templateInfo.preset.packageName, '@fixture/templates')
  assert.equal(preview.parameterization.values.label, 'Organization SDK')
  assert.equal(preview.parameterization.values.token, '[redacted]')
  assertNoParameterSecret(preview)
  assert.ok(!existsSync(path.join(first, 'packages/sdk')))
  assertNoParameterSecret(run(process.execPath, createArgs, first))
  assert.equal(json(path.join(first, 'packages/sdk/package.json')).name, 'sdk')
  assert.equal(readFileSync(path.join(first, 'packages/sdk/index.js'), 'utf8'), 'export const answer = 42\nexport const label = "Organization SDK"\n')
  assert.equal(readFileSync(path.join(first, 'packages/sdk/credentials.local'), 'utf8'), `TOKEN=${parameterSecret}\n`)
  assert.ok(!existsSync(path.join(first, 'packages/sdk/repoctl.template.json')))
  const provenance = json(path.join(first, '.repoctl/template-instances.json')).instances[0]
  assert.equal(provenance.source.remote.packageName, '@fixture/templates')
  assert.equal(provenance.source.remote.version, '1.2.3')
  assert.equal(provenance.generator.profile, 'repo-new-parameters-v1')
  assert.deepEqual(provenance.parameters.templateValues, { label: 'Organization SDK' })
  assert.deepEqual(provenance.parameters.sensitiveParameters, ['token'])
  assert.deepEqual(provenance.excludedPaths, ['credentials.local'])
  inspectMetadata(path.join(first, '.repoctl'))
  assert.ok(!existsSync(path.join(second, 'packages/sdk')))
  assert.ok(!existsSync(marker))
  console.log('Packaged organization presets passed: two independent consumers, exports-hidden manifests, exact identities, project/CLI precedence, recommendations, unified templates, explicit asset transactions, verified offline parameterized creation, redacted secrets, exact provenance and no preset code execution.')
}
finally {
  if (server) {
    server.kill('SIGTERM')
    await once(server, 'exit')
  }
  if (process.env.REPOCTL_KEEP_PRESET_FIXTURE !== '1') {
    rmSync(root, { recursive: true, force: true })
  }
  else {
    console.log(`Retained preset fixture: ${root}`)
  }
}
