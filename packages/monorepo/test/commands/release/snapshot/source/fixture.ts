import type { SnapshotOptions } from '@icebreakers/monorepo'
import { createHash } from 'node:crypto'
import { mkdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fixture } from '../fixture'

export const sha256 = (bytes: string | Uint8Array) => createHash('sha256').update(bytes).digest('hex')

export async function sourceFixture(gitlink = false) {
  const h = await fixture()
  const root = JSON.parse(await readFile(path.join(h.cwd, 'package.json'), 'utf8'))
  await h.write('package.json', JSON.stringify({ ...root, scripts: { build: 'node build.cjs' } }))
  const pkg = JSON.parse(await readFile(path.join(h.cwd, 'packages/a/package.json'), 'utf8'))
  await h.write('packages/a/package.json', JSON.stringify({ ...pkg, files: ['dist', 'binding.node'] }))
  await h.write('build.cjs', `const fs=require('node:fs');
if(fs.readFileSync('packages/a/binding.node','utf8')!=='native-input')throw new Error('Source preparation must precede build');
if(!JSON.parse(fs.readFileSync('packages/a/package.json','utf8')).version.includes('-snapshot.'))throw new Error('Snapshot manifests must precede source preparation');
for(const name of ['a','b']){fs.mkdirSync('packages/'+name+'/dist',{recursive:true});fs.copyFileSync('packages/'+name+'/index.js','packages/'+name+'/dist/index.js')}`)
  h.run('git', ['add', '.'])
  if (gitlink) {
    await mkdir(path.join(h.cwd, 'references/tooling'), { recursive: true })
    h.run('git', ['update-index', '--add', '--cacheinfo', '160000', h.options.identity.commit, 'references/tooling'])
  }
  h.run('git', ['-c', 'commit.gpgsign=false', 'commit', '-qm', 'source preparation'])
  const commit = h.run('git', ['rev-parse', 'HEAD'])
  const options: SnapshotOptions = { ...h.options, identity: { kind: 'nightly', commit, buildId: 'source-preparation' } }
  return { ...h, options, commit, tree: h.run('git', ['rev-parse', 'HEAD^{tree}']) }
}
