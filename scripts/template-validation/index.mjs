import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { createWorkspace, json, run, writeJson } from '../packaged-template/workspace.mjs'

const root = mkdtempSync(path.join(tmpdir(), 'repoctl-packaged-template-validation-'))
try {
  const workspace = createWorkspace(root, [])
  assert.equal(json(path.join(workspace, 'package.json')).scripts['test:packaged-template-validation'], undefined)
  assert.ok(!readFileSync(path.join(workspace, '.github/workflows/ci.yml'), 'utf8').includes('test:packaged-template-validation'))
  const author = path.join(root, 'independent-author')
  const template = path.join(author, 'templates/library')
  const fixture = path.join(author, 'workspace')
  mkdirSync(template, { recursive: true })
  mkdirSync(fixture, { recursive: true })
  writeJson(path.join(author, 'package.json'), { name: 'author', private: true })
  writeFileSync(path.join(author, 'pnpm-workspace.yaml'), 'packages: []\n')
  writeFileSync(path.join(author, 'repoctl.config.mjs'), 'export default { commands: { create: { templatesDir: "./templates", templateMap: { team: {source: "library", target: "packages/team", category: "library"} } } } }\n')
  writeJson(path.join(fixture, 'package.json'), { name: 'fixture', private: true, packageManager: json(path.join(workspace, 'package.json')).packageManager })
  writeFileSync(path.join(fixture, 'pnpm-workspace.yaml'), 'packages: ["packages/*"]\n')
  writeJson(path.join(template, 'package.json'), {
    name: 'template',
    version: '1.0.0',
    private: true,
    type: 'module',
    license: 'MIT',
    files: ['dist'],
    exports: { '.': './dist/index.js' },
    scripts: { build: 'node tasks.mjs build', lint: 'node tasks.mjs lint', test: 'node tasks.mjs test' },
  })
  writeFileSync(path.join(template, 'tasks.mjs'), `import assert from 'node:assert/strict'
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
if (process.argv[2] === 'build') { mkdirSync('dist', {recursive: true}); writeFileSync('dist/index.js', 'export const value = 42'); if (existsSync('feature.js')) copyFileSync('feature.js', 'dist/feature.js') }
else { assert.equal((await import('./dist/index.js')).value, 42) }
console.log((await import('./secret.json', {with: {type: 'json'}})).default.token)
`)
  const secret = 'packaged-validation-sensitive-value'
  const parameterSets = [{ enabled: false, secret }, { enabled: true, secret }]
  writeJson(path.join(template, 'repoctl.template.json'), {
    schemaVersion: 1,
    parameters: { enabled: { type: 'boolean', default: false }, secret: { type: 'string', required: true, sensitive: true } },
    interpolate: ['secret.json'],
    conditions: [{ when: { parameter: 'enabled', equals: true }, files: ['feature.js'] }],
  })
  writeFileSync(path.join(template, 'secret.json'), '{"token": {{repoctl-json:secret}}}')
  writeFileSync(path.join(template, 'feature.js'), 'export const enabled = true')
  const matrix = path.join(author, 'matrix.json')
  writeJson(matrix, parameterSets)
  const cli = path.join(workspace, 'node_modules/repoctl/bin/repoctl.js')
  const report = JSON.parse(run(process.execPath, [cli, 'templates', 'validate', 'team', '--fixture', fixture, '--parameter-matrix', matrix, '--json'], author))
  assert.equal(report.status, 'passed', JSON.stringify(report))
  assert.equal(report.retained, false)
  assert.equal(report.samples.length, 2)
  assert.ok(!JSON.stringify(report).includes(secret))
  writeFileSync(path.join(workspace, 'validate-author.mjs'), `import assert from 'node:assert/strict'
import { planTemplateValidation, validateTemplate } from 'repoctl'
const options = ${JSON.stringify({ cwd: author, template: 'team', fixtureDir: fixture, parameterSets })}
assert.equal((await planTemplateValidation(options)).diagnostics.length, 0)
const report = await validateTemplate({...options, names: ['second-name']})
assert.equal(report.status, 'passed', JSON.stringify(report))
assert.deepEqual(report.samples.map(sample => sample.parameterSet), [0, 1])
assert.ok(!JSON.stringify(report).includes(${JSON.stringify(secret)}))
`)
  run(process.execPath, ['validate-author.mjs'], workspace)
  writeFileSync(path.join(template, 'feature.js'), 'export const optional = () => import(\'missing-conditional-runtime\')')
  writeFileSync(path.join(workspace, 'validate-broken.mjs'), `import assert from 'node:assert/strict'
import { validateTemplate } from 'repoctl'
const report = await validateTemplate(${JSON.stringify({ cwd: author, template: 'team', fixtureDir: fixture, parameterSets })})
assert.deepEqual(report.samples.map(sample => sample.status), ['passed', 'failed'])
assert.equal(report.samples[1].failedStage, 'artifact')
assert.ok(report.samples[1].artifact.packages.flatMap(pkg => pkg.diagnostics).some(item => item.code === 'UNDECLARED_RUNTIME_DEPENDENCY'))
assert.ok(!JSON.stringify(report).includes(${JSON.stringify(secret)}))
`)
  run(process.execPath, ['validate-broken.mjs'], workspace)
  console.log('Packaged template author validation passed: public helper, CLI, independent author, typed parameter matrix, secret redaction, conditional dependency failure and tarball consumer.')
}
finally {
  rmSync(root, { recursive: true, force: true })
}
