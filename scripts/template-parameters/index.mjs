import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { createWorkspace, json, registry, run, writeJson } from '../packaged-template/workspace.mjs'

const root = mkdtempSync(path.join(tmpdir(), 'repoctl-packaged-parameters-'))
const secret = 'repoctl-smoke-private-input-734'
function noSecret(value) {
  if (typeof value === 'string') {
    assert.ok(!value.includes(secret))
    assert.ok(!Buffer.from(value, 'base64').toString('utf8').includes(secret))
  }
  else if (value && typeof value === 'object') {
    for (const child of Object.values(value)) {
      noSecret(child)
    }
  }
}
function inspectMetadata(directory) {
  for (const item of readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, item.name)
    if (item.isDirectory()) {
      inspectMetadata(file)
    }
    else {
      noSecret(JSON.parse(readFileSync(file, 'utf8')))
    }
  }
}
try {
  const workspace = createWorkspace(root, [])
  assert.equal(json(path.join(workspace, 'package.json')).scripts['test:packaged-template-parameters'], undefined)
  assert.ok(!readFileSync(path.join(workspace, '.github/workflows/ci.yml'), 'utf8').includes('test:packaged-template-parameters'))
  const require = createRequire(realpathSync(path.join(workspace, 'node_modules/repoctl/package.json')))
  const coreRequire = createRequire(require.resolve('@icebreakers/monorepo/package.json'))
  const templates = path.dirname(coreRequire.resolve('@icebreakers/monorepo-templates/package.json'))
  const vitestVersion = json(path.join(workspace, 'node_modules/vitest/package.json')).version
  const source = path.join(root, 'independent-author')
  cpSync(path.join(templates, 'templates/tsdown'), source, { recursive: true })
  const pkg = json(path.join(source, 'package.json'))
  delete pkg.scripts.test
  delete pkg.scripts['test:dev']
  writeJson(path.join(source, 'package.json'), pkg)
  writeJson(path.join(source, 'repoctl.template.json'), {
    schemaVersion: 1,
    parameters: {
      title: { type: 'string', required: true },
      tests: { type: 'boolean', default: false },
      flavor: { type: 'enum', options: ['plain', 'bold'], default: 'plain' },
      token: { type: 'string', required: true, sensitive: true },
    },
    interpolate: ['src/settings.ts', 'credentials.local'],
    conditions: [{ when: { parameter: 'tests', equals: true }, files: ['test', 'vitest.config.ts'], package: { scripts: { 'test': 'vitest run', 'test:dev': 'vitest' }, devDependencies: { vitest: vitestVersion } } }],
  })
  writeFileSync(path.join(source, 'src/settings.ts'), 'export const title = \'{{repoctl:title}}\'\nexport const flavor = \'{{repoctl:flavor}}\'\n')
  writeFileSync(path.join(source, 'src/index.ts'), `${readFileSync(path.join(source, 'src/index.ts'), 'utf8')}\nexport { flavor, title } from './settings'\n`)
  writeFileSync(path.join(source, 'credentials.local'), 'TOKEN={{repoctl:token}}\n')
  const configuration = { commands: { create: { templateMap: { team: { source, target: 'packages/team', category: 'library' } } } } }
  writeFileSync(path.join(workspace, 'repoctl.config.ts'), `export default ${JSON.stringify(configuration, null, 2)}\n`)
  const cli = path.join(workspace, 'node_modules/repoctl/bin/repoctl.js')
  const variants = [{ name: 'enabled', tests: true, title: 'Hello', flavor: 'bold' }, { name: 'disabled', tests: false, title: 'World', flavor: 'plain' }]
  for (const variant of variants) {
    const { name, ...values } = variant
    const data = path.join(root, `${name}.json`)
    writeJson(data, { ...values, token: secret })
    const args = [cli, 'new', name, '--template', 'team', '--data', data]
    const preview = JSON.parse(run(process.execPath, [...args, '--json'], workspace))
    noSecret(preview)
    assert.equal(preview.parameterization.values.token, '[redacted]')
    const target = path.join(workspace, 'packages', name)
    assert.equal(existsSync(target), false)
    noSecret(run(process.execPath, args, workspace))
    const generated = json(path.join(target, 'package.json'))
    assert.equal(generated.scripts.test, variant.tests ? 'vitest run' : undefined)
    assert.equal(generated.devDependencies?.vitest, variant.tests ? vitestVersion : undefined)
    assert.equal(existsSync(path.join(target, 'test')), variant.tests)
    assert.equal(existsSync(path.join(target, 'repoctl.template.json')), false)
    assert.equal(readFileSync(path.join(target, 'credentials.local'), 'utf8'), `TOKEN=${secret}\n`)
    assert.throws(() => run(process.execPath, args, workspace), /already exists|已存在/u)
  }
  inspectMetadata(path.join(workspace, '.repoctl'))
  run('pnpm', ['install', '--ignore-scripts', '--no-frozen-lockfile', '--registry', registry], workspace)
  for (const command of ['build', 'lint', 'typecheck', 'tsd', 'test']) {
    console.log(`Validating generated variants: ${command}`)
    run('pnpm', [command], workspace)
  }
  const consumer = path.join(root, 'consumer')
  mkdirSync(consumer)
  writeJson(path.join(consumer, 'package.json'), { name: 'parameter-consumer', private: true, type: 'module', packageManager: json(path.join(workspace, 'package.json')).packageManager })
  writeFileSync(path.join(consumer, 'pnpm-workspace.yaml'), 'packages: []\n')
  const archives = []
  for (const variant of variants) {
    const packDir = path.join(root, `pack-${variant.name}`)
    mkdirSync(packDir)
    run('pnpm', ['pack', '--pack-destination', packDir], path.join(workspace, 'packages', variant.name))
    archives.push(path.join(packDir, readdirSync(packDir).find(file => file.endsWith('.tgz'))))
  }
  run('pnpm', ['add', ...archives, '--ignore-scripts', '--registry', registry], consumer)
  writeFileSync(path.join(consumer, 'check.mjs'), `import assert from 'node:assert/strict'\nfor (const variant of ${JSON.stringify(variants)}) { const library = await import(variant.name); assert.equal(library.title, variant.title); assert.equal(library.flavor, variant.flavor); assert.equal(library.greet('consumer'), 'hello consumer') }\n`)
  run(process.execPath, ['check.mjs'], consumer)
  console.log('Packaged typed parameter validation passed: two variants, retained secret boundaries, full generated matrix and isolated tarball consumers.')
}
finally {
  rmSync(root, { recursive: true, force: true })
}
