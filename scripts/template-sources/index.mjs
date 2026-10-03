import assert from 'node:assert/strict'
import { fork } from 'node:child_process'
import { once } from 'node:events'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import { createWorkspace, json, run, writeJson } from '../packaged-template/workspace.mjs'

const root = mkdtempSync(path.join(tmpdir(), 'repoctl-packaged-template-sources-'))
let server
try {
  const workspace = createWorkspace(root, [])
  assert.equal(json(path.join(workspace, 'package.json')).scripts['test:packaged-template-sources'], undefined)
  assert.ok(!readFileSync(path.join(workspace, '.github/workflows/ci.yml'), 'utf8').includes('test:packaged-template-sources'))
  const source = path.join(root, 'source')
  mkdirSync(source)
  const marker = path.join(root, 'unexpected-script')
  writeJson(path.join(source, 'package.json'), {
    name: '@fixture/templates',
    version: '1.2.3',
    type: 'module',
    scripts: { prepare: `node -e ${JSON.stringify(`require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'bad')`)}` },
  })
  writeFileSync(path.join(source, 'index.js'), 'export const value = 42\n')
  const hooks = path.join(root, 'hooks')
  mkdirSync(hooks)
  const git = args => run('git', ['-c', `core.hooksPath=${hooks}`, ...args], source)
  git(['init'])
  git(['config', 'user.name', 'Template Smoke'])
  git(['config', 'user.email', 'template@example.test'])
  git(['add', '.'])
  git(['commit', '-m', 'fixture'])
  const commit = git(['rev-parse', 'HEAD']).trim()
  const archive = path.join(root, 'package.tgz')
  git(['archive', '--format=tar.gz', '--prefix=package/', `--output=${archive}`, 'HEAD'])
  server = fork(path.join(import.meta.dirname, 'registry.mjs'), [archive], { stdio: ['ignore', 'inherit', 'inherit', 'ipc'] })
  const [{ port }] = await once(server, 'message')
  const remote = { kind: 'npm', packageName: '@fixture/templates', version: '1.2.3', registry: `http://127.0.0.1:${port}/` }
  const gitRemote = { kind: 'git', repository: pathToFileURL(source).href, ref: commit }
  const cacheDir = path.join(root, 'cache')
  writeFileSync(path.join(workspace, '.npmrc'), `//127.0.0.1:${port}/:_authToken=packaged-template-secret\n`)
  writeFileSync(path.join(workspace, 'repoctl.config.ts'), `export default ${JSON.stringify({ commands: { create: { cacheDir, templateMap: { team: { source: '.', target: 'packages/team', category: 'library', remote } } } } })}\n`)
  const cli = path.join(workspace, 'node_modules/repoctl/bin/repoctl.js')
  const fetched = JSON.parse(run(process.execPath, [cli, 'templates', 'fetch', 'team', '--json'], workspace))
  assert.equal(fetched.resolved.version, '1.2.3')
  assert.equal(fetched.cache, 'downloaded')
  const plan = JSON.parse(run(process.execPath, [cli, 'new', 'sdk', '--template', 'team', '--offline', '--json'], workspace))
  assert.ok(!existsSync(plan.targetDir))
  server.kill('SIGTERM')
  await once(server, 'exit')
  server = undefined
  run(process.execPath, [cli, 'new', 'sdk', '--template', 'team', '--offline'], workspace)
  assert.equal(json(path.join(workspace, 'packages/sdk/package.json')).name, 'sdk')
  const instances = readFileSync(path.join(workspace, '.repoctl/template-instances.json'), 'utf8')
  assert.equal(JSON.parse(instances).instances[0].source.remote.version, '1.2.3')
  assert.ok(!instances.includes('packaged-template-secret'))
  assert.ok(!existsSync(marker))
  writeFileSync(path.join(workspace, 'remote-helper.mjs'), `import assert from 'node:assert/strict'
import { resolveRemoteTemplateSource } from 'repoctl'
const source = ${JSON.stringify(gitRemote)}
const options = ${JSON.stringify({ cacheDir })}
const first = await resolveRemoteTemplateSource(source, '.', options)
assert.equal(first.resolved.commit, source.ref)
assert.equal((await resolveRemoteTemplateSource(source, '.', {...options, offline: true})).cache, 'hit')
`)
  run(process.execPath, ['remote-helper.mjs'], workspace)
  writeFileSync(path.join(fetched.sourceDir, 'index.js'), 'export const value = 99\n')
  assert.throws(() => run(process.execPath, [cli, 'new', 'changed', '--template', 'team', '--offline'], workspace), /integrity verification/)
  assert.ok(!existsSync(path.join(workspace, 'packages/changed')))
  console.log('Packaged remote templates passed: authenticated npm, fixed Git, public helper, CLI, offline creation, provenance and corrupt-cache refusal.')
}
finally {
  if (server) {
    server.kill('SIGTERM')
    await once(server, 'exit')
  }
  rmSync(root, { recursive: true, force: true })
}
