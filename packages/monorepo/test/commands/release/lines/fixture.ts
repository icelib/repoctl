import type { ReleaseBranchesConfig, ReleaseCiOptions } from '@icebreakers/monorepo'
import { readFile, rm } from 'node:fs/promises'
import crossSpawn from 'cross-spawn'
import path from 'pathe'
import { afterEach } from 'vitest'
import { fixture } from '../plan/fixture'

const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map(cwd => rm(cwd, { recursive: true, force: true })))
})

export const branches: ReleaseBranchesConfig = {
  stable: 'master',
  maintenance: [{ branch: '1.x', range: '1.x', tag: 'legacy-1' }],
  prerelease: [{ branch: 'preview/1.x', lane: 'beta', tag: 'legacy-beta', target: '1.x' }],
}

export async function lineFixture(bump = 'patch') {
  const h = await fixture()
  roots.push(h.cwd)
  await rm(path.join(h.cwd, '.pnpmfile.cjs'))
  await h.write('repoctl.config.mjs', `export default ${JSON.stringify({ commands: { release: { branches, qualityScripts: [] } } })}`)
  await h.write('.changeset/test.md', `---\na: ${bump}\nprivate-lib: patch\n---\nMaintenance change.\n`)
  for (const name of ['a', 'b', 'consumer', 'private-lib']) {
    const filename = `packages/${name}/package.json`
    const manifest = JSON.parse(await readFile(path.join(h.cwd, filename), 'utf8'))
    delete manifest.scripts
    if (name === 'consumer') {
      manifest.dependencies.a = 'workspace:*'
    }
    await h.write(filename, JSON.stringify(manifest))
  }
  const options: ReleaseCiOptions = { cwd: h.cwd, branch: '1.x', env: h.env, spawn: crossSpawn.sync, config: { branches, qualityScripts: [] } }
  return { ...h, options }
}
