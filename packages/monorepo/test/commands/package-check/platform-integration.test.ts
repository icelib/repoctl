import { rm } from 'node:fs/promises'
import process from 'node:process'
import { afterEach, expect, it } from 'vitest'
// eslint-disable-next-line antfu/no-import-dist -- 验证交付构建中的真实安装与 Node 加载。
import { checkPackages } from '../../../dist/index.mjs'
import { addPackage, fixture } from './fixtures'

const directories: string[] = []
afterEach(async () => Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true }))))

it('保留异平台产物的静态校验，但不安装或执行它', async () => {
  const cwd = await fixture()
  directories.push(cwd)
  await addPackage(cwd, 'foreign', { os: [`!${process.platform}`], exports: './dist/index.js' }, { 'dist/index.js': 'throw new Error("foreign must never execute")' })
  const report = await checkPackages({ cwd })
  expect(report.status, JSON.stringify(report, null, 2)).toBe('passed')
  expect(report.packages[0]).toMatchObject({ status: 'passed', applicability: { status: 'not-applicable' } })
  expect(report.packages[0]!.files).toContain('dist/index.js')
  expect(report.packages[0]!.commands.some(command => command.args.includes('install') || command.args.includes('--eval'))).toBe(false)
}, 120_000)

it('异平台包缺少导出仍失败，不能以不适用隐藏静态缺陷', async () => {
  const cwd = await fixture()
  directories.push(cwd)
  await addPackage(cwd, 'foreign', { os: [`!${process.platform}`], exports: './dist/missing.js' }, {})
  const report = await checkPackages({ cwd })
  expect(report.status).toBe('failed')
  expect(report.packages[0]!.diagnostics).toContainEqual(expect.objectContaining({ code: 'FILE_DOES_NOT_EXIST', severity: 'error' }))
  expect(report.packages[0]!.applicability?.status).toBe('not-applicable')
}, 120_000)

it('宿主原生包实际交给 Node require，无效二进制不能静默通过', async () => {
  const cwd = await fixture()
  directories.push(cwd)
  await addPackage(cwd, 'native', { os: [process.platform], cpu: [process.arch], exports: './dist/binding.node' }, { 'dist/binding.node': 'invalid native binary' })
  const report = await checkPackages({ cwd })
  expect(report.status).toBe('failed')
  expect(report.packages[0]!.commands).toContainEqual(expect.objectContaining({ args: ['--input-type', 'commonjs', '--eval', 'require("native")'], exitCode: 1 }))
  expect(report.packages[0]!.diagnostics).toContainEqual(expect.objectContaining({ code: 'RUNTIME_IMPORT', source: 'node' }))
}, 120_000)
