import { spawnSync } from 'node:child_process'
import { writeFile } from 'node:fs/promises'
import process from 'node:process'
import { expect, it } from 'vitest'
import { verifyNightlyConsumer } from '../../../../../src/commands/release/nightly/consumer'
import { consumerFixture } from './fixture'

it('从已验证 tarball 筛选真实宿主，异平台包不进入安装根依赖', async () => {
  const h = await consumerFixture({ configure(manifest, index) {
    if (index === 1) {
      manifest['os'] = [`!${process.platform}`]
    }
  } })
  await verifyNightlyConsumer(h.report, h.options)
  expect(h.report.consumer?.status).toBe('verified')
  expect(h.report.consumer?.packages).toHaveLength(1)
  expect(h.report.consumer?.applicability?.map(item => item.status)).toEqual(['applicable', 'not-applicable'])
  expect(h.manifest()['dependencies']).not.toHaveProperty(h.report.packages[1]!.name)
})

it('全部异平台时仍检查每个归档的完整性，但不启动子进程', async () => {
  const h = await consumerFixture({ manifest: { os: [`!${process.platform}`] } })
  await verifyNightlyConsumer(h.report, h.options)
  expect(h.report.consumer?.status).toBe('verified')
  expect(h.report.consumer?.packages).toEqual([])
  expect(h.spawn).not.toHaveBeenCalled()
  await writeFile(h.report.snapshot!.packages[1]!.tarball!, 'tampered foreign artifact')
  await expect(verifyNightlyConsumer(h.report, h.options)).rejects.toThrow('tarball integrity changed')
})

it.each([false, true])('必需不兼容依赖阻断，可选依赖按宿主过滤：optional=%s', async (optional) => {
  const h = await consumerFixture({ configure(manifest, index) {
    if (index === 1) {
      manifest['os'] = [`!${process.platform}`]
    }
    else {
      manifest[optional ? 'optionalDependencies' : 'dependencies'] = { b: '*' }
    }
  } })
  if (optional) {
    await verifyNightlyConsumer(h.report, h.options)
    expect(h.report.consumer?.status).toBe('verified')
  }
  else {
    await expect(verifyNightlyConsumer(h.report, h.options)).rejects.toThrow('required dependency')
    expect(h.spawn).not.toHaveBeenCalled()
  }
})

it('发布后使用真实 Node require 验证原生入口，加载失败不能当作无入口通过', async () => {
  const h = await consumerFixture({ manifest: { exports: './binding.node' }, files: { 'binding.node': 'invalid native addon' } })
  h.options.spawn = ((command, args, settings) => args?.includes('--eval') ? spawnSync(command, args, { ...settings, encoding: 'utf8' }) : h.spawn(command, args ?? [], settings ?? {})) as NonNullable<typeof h.options.spawn>
  await expect(verifyNightlyConsumer(h.report, h.options)).rejects.toThrow()
  expect(h.report.consumer?.commands).toContainEqual(expect.objectContaining({ args: ['--input-type', 'commonjs', '--eval', `require(${JSON.stringify(h.report.packages[0]!.name)})`], exitCode: 1 }))
})
