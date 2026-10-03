import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { createWorkspace, json, registry, run } from '../packaged-template/workspace.mjs'
import { checkTarballConsumer } from './consumer.mjs'

const tempRoot = mkdtempSync(path.join(tmpdir(), 'repoctl-packaged-react-lib-'))
console.log(`React library regression workspace: ${tempRoot}`)
try {
  const workspace = createWorkspace(tempRoot, ['react-lib'])
  const library = path.join(workspace, 'packages/react-lib')
  assert.equal(json(path.join(library, 'package.json')).private, true)
  assert.equal(json(path.join(workspace, 'package.json')).scripts['test:packaged-react-lib'], undefined)
  assert.ok(!readFileSync(path.join(workspace, '.github/workflows/ci.yml'), 'utf8').includes('pnpm test:packaged-react-lib'))
  assert.equal(existsSync(path.join(library, 'dist')), false)
  const args = ['exec', 'repoctl', 'new', 'second-library', '--template', 'react-lib']
  run('pnpm', [...args, '--json', '--out', 'react-lib-plan.json'], workspace)
  const plan = json(path.join(workspace, 'react-lib-plan.json'))
  assert.equal(plan.targetName, 'packages/second-library')
  const second = path.join(workspace, plan.targetName)
  assert.equal(existsSync(second), false)
  run('pnpm', args, workspace)
  const secondFile = path.join(second, 'package.json')
  assert.equal(json(secondFile).name, 'second-library')
  const original = readFileSync(secondFile, 'utf8')
  assert.throws(() => run('pnpm', args, workspace), /already exists|已存在/u)
  assert.equal(readFileSync(secondFile, 'utf8'), original)
  run('pnpm', ['exec', 'repoctl', 'templates', '--check', '--json'], workspace)
  run('pnpm', ['install', '--ignore-scripts', '--no-frozen-lockfile', '--registry', registry], workspace)
  for (const command of ['build', 'lint', 'typecheck', 'tsd', 'test']) {
    console.log(`Checking generated React libraries: ${command}…`)
    run('pnpm', [command], workspace)
  }
  await checkTarballConsumer(tempRoot, library)
  console.log('Packaged React library passed: both creation flows, protected targets, public types, CSS, peers and tarball consumption.')
}
finally {
  if (process.env.REACT_LIB_SMOKE_KEEP === '1') {
    console.log(`Retained React library regression workspace: ${tempRoot}`)
  }
  else {
    rmSync(tempRoot, { recursive: true, force: true })
  }
}
