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
import { mkdirSync, writeFileSync } from 'node:fs'
if (process.argv[2] === 'build') { mkdirSync('dist', {recursive: true}); writeFileSync('dist/index.js', 'export const value = 42') }
else { assert.equal((await import('./dist/index.js')).value, 42) }
`)
  const cli = path.join(workspace, 'node_modules/repoctl/bin/repoctl.js')
  const report = JSON.parse(run(process.execPath, [cli, 'templates', 'validate', 'team', '--fixture', fixture, '--json'], author))
  assert.equal(report.status, 'passed', JSON.stringify(report))
  assert.equal(report.retained, false)
  writeFileSync(path.join(workspace, 'validate-author.mjs'), `import assert from 'node:assert/strict'
import { planTemplateValidation, validateTemplate } from 'repoctl'
const options = ${JSON.stringify({ cwd: author, template: 'team', fixtureDir: fixture })}
assert.equal((await planTemplateValidation(options)).diagnostics.length, 0)
const report = await validateTemplate({...options, names: ['second-name']})
assert.equal(report.status, 'passed', JSON.stringify(report))
`)
  run(process.execPath, ['validate-author.mjs'], workspace)
  console.log('Packaged template author validation passed: public helper, CLI, independent author, generated scripts and tarball consumer.')
}
finally {
  rmSync(root, { recursive: true, force: true })
}
