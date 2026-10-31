import { readFile, rm } from 'node:fs/promises'
import path from 'node:path'
import { afterEach, expect, it } from 'vitest'
// eslint-disable-next-line antfu/no-import-dist -- 验证交付构建的真实 tarball 消费链。
import { checkPackages } from '../../../dist/index.mjs'
import { addPackage, fixture } from './fixtures'

const directories: string[] = []
afterEach(async () => Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true }))))

it('executes a three-package required peer chain with an alias from the checked tarballs', async () => {
  const cwd = await fixture()
  directories.push(cwd)
  await addPackage(cwd, 'fixture-required-host', { exports: './dist/index.mjs' }, {
    'dist/index.mjs': 'export const marker = "checked-required-peer-candidate"',
  })
  await addPackage(cwd, 'fixture-required-bridge', {
    exports: './dist/index.mjs',
    peerDependencies: { 'host-alias': 'workspace:fixture-required-host@*' },
  }, {
    'dist/index.mjs': 'import { marker } from "host-alias"; if (marker !== "checked-required-peer-candidate") throw new Error("Wrong required peer candidate"); export { marker }',
  })
  await addPackage(cwd, 'fixture-required-adapter', {
    exports: './dist/index.mjs',
    peerDependencies: { 'fixture-required-bridge': 'workspace:*' },
    devDependencies: { 'not-a-consumer-development-dependency': '*' },
  }, {
    'dist/index.mjs': 'import { marker } from "fixture-required-bridge"; if (marker !== "checked-required-peer-candidate") throw new Error("Wrong transitive required peer candidate"); export { marker }',
  })

  const report = await checkPackages({ cwd, filters: ['fixture-required-adapter'], keepTemp: true })
  directories.push(report.temporaryDirectory!)
  expect(report.status, JSON.stringify(report, null, 2)).toBe('passed')
  expect(report.packages.map(pkg => pkg.name).sort()).toEqual(['fixture-required-adapter', 'fixture-required-bridge', 'fixture-required-host'])
  const adapterIndex = report.packages.findIndex(pkg => pkg.name === 'fixture-required-adapter')
  const directory = path.join(report.temporaryDirectory!, 'consumers', String(adapterIndex))
  const consumer = JSON.parse(await readFile(path.join(directory, 'package.json'), 'utf8')) as { dependencies: Record<string, string>, devDependencies?: Record<string, string> }
  for (const [alias, name] of [['fixture-required-bridge', 'fixture-required-bridge'], ['host-alias', 'fixture-required-host']] as const) {
    const candidate = report.packages.find(pkg => pkg.name === name)!
    expect(consumer.dependencies[alias]).toBe(`file:${candidate.tarball}`)
    const installed = JSON.parse(await readFile(path.join(directory, 'node_modules', alias, 'package.json'), 'utf8')) as { name: string, version: string }
    expect(installed).toMatchObject({ name, version: '1.0.0' })
  }
  expect(consumer.dependencies).not.toHaveProperty('not-a-consumer-development-dependency')
  expect(consumer.devDependencies).toBeUndefined()
  expect(report.packages.every(pkg => pkg.commands.some(command => command.args.includes('--eval') && command.exitCode === 0))).toBe(true)
}, 120_000)
