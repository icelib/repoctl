import assert from 'node:assert/strict'
import { readFile, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
// eslint-disable-next-line antfu/no-import-dist -- Exercise shipped tarballs and their real dependency closure.
import { checkPackages } from '../../packages/monorepo/dist/index.mjs'

// Package checking rebuilds its dependency closure. Run outside parallel unit tests
// so readers never observe declarations or runtime chunks during that rebuild.
const cwd = fileURLToPath(new URL('../../', import.meta.url))
const report = await checkPackages({ cwd, filters: ['repoctl'], keepTemp: true })
try {
  assert.equal(report.status, 'passed', JSON.stringify(report.packages.map(({ name, diagnostics }) => ({ name, diagnostics })), null, 2))
  const index = report.packages.findIndex(pkg => pkg.name === 'repoctl')
  assert.ok(index >= 0)
  const consumer = path.join(report.temporaryDirectory, 'consumers', String(index))
  const require = createRequire(path.join(consumer, 'package.json'))
  const runtime = JSON.parse(await readFile(require.resolve('typescript/package.json'), 'utf8'))
  assert.match(runtime.version, /^7\./)
  const checks = report.packages[index].commands.filter(command => command.args.includes('--noEmit'))
  assert.ok(checks.length >= 2)
  assert.ok(checks.every(command => command.exitCode === 0))
  console.log('Published repoctl and tooling declarations pass strict checks with the TypeScript 7 runtime peer.')
}
finally {
  if (report.temporaryDirectory) {
    await rm(report.temporaryDirectory, { recursive: true, force: true })
  }
}
