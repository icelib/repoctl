import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { createPackageFromTarballData } from '@arethetypeswrong/core'
import { releaseSnapshot } from '@icebreakers/monorepo'
import { expect, it } from 'vitest'
import { sha256, sourceFixture } from './fixture'

it('拒绝 prepack 临时替换而 postpack 恢复的已核验产物', async () => {
  const h = await sourceFixture()
  const manifest = JSON.parse(await readFile(path.join(h.cwd, 'packages/a/package.json'), 'utf8'))
  const change = (value: string) => `node -e "require('node:fs').writeFileSync('binding.node','${value}')"`
  await h.write('packages/a/package.json', JSON.stringify({ ...manifest, scripts: { prepack: change('packed-replacement'), postpack: change('native-input') } }))
  h.run('git', ['add', 'packages/a/package.json'])
  h.run('git', ['-c', 'commit.gpgsign=false', 'commit', '-qm', 'replace packed artifact temporarily'])
  const report = await releaseSnapshot({ ...h.options, identity: { ...h.options.identity, commit: h.run('git', ['rev-parse', 'HEAD']) }, prepareSource: async ({ directory }) => {
    await writeFile(path.join(directory, 'packages/a/binding.node'), 'native-input')
    return { files: [{ path: 'packages/a/binding.node', sha256: sha256('native-input') }] }
  } })
  expect(report.status, report.error).toBe('failed')
  expect(report.error).toContain('in tarball')
  expect(h.uploads).toEqual([])
}, 120_000)

it('保留未发布的构建输入回执，不要求其出现在包归档中', async () => {
  const h = await sourceFixture()
  const report = await releaseSnapshot({ ...h.options, prepareSource: async ({ directory }) => {
    await writeFile(path.join(directory, 'packages/a/binding.node'), 'native-input')
    await writeFile(path.join(directory, 'native-input.node'), 'build-only-input')
    return { files: [
      { path: 'packages/a/binding.node', sha256: sha256('native-input') },
      { path: 'native-input.node', sha256: sha256('build-only-input') },
    ] }
  } })
  expect(report.status, report.error).toBe('prepared')
  const pkg = report.packages.find(pkg => pkg.name === 'snapshot-a')!
  const packed = createPackageFromTarballData(Uint8Array.from(await readFile(pkg.tarball!)))
  expect(packed.readFile('/node_modules/snapshot-a/binding.node')).toBe('native-input')
  expect(report.preparation?.files).toHaveLength(2)
}, 120_000)

it('没有准备回调时也拒绝构建重新填充被省略的参考 gitlink', async () => {
  const h = await sourceFixture(true)
  await h.write('build.cjs', `const fs=require('node:fs');
for(const name of ['a','b']){fs.mkdirSync('packages/'+name+'/dist',{recursive:true});fs.copyFileSync('packages/'+name+'/index.js','packages/'+name+'/dist/index.js')}
fs.mkdirSync('references/tooling',{recursive:true});fs.writeFileSync('references/tooling/reintroduced.txt','not omitted')`)
  h.run('git', ['add', 'build.cjs'])
  h.run('git', ['-c', 'commit.gpgsign=false', 'commit', '-qm', 'restore omitted reference during build'])
  const report = await releaseSnapshot({ ...h.options, identity: { ...h.options.identity, commit: h.run('git', ['rev-parse', 'HEAD']) }, referenceGitlinks: ['references/tooling'] })
  expect(report.status, report.error).toBe('failed')
  expect(report.error).toContain('must remain an empty omitted directory')
  expect(h.uploads).toEqual([])
}, 120_000)
