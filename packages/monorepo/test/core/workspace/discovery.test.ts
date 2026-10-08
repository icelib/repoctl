import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { afterEach, expect, it } from 'vitest'
import { findWorkspacePackages } from '@/core/workspace/discovery'

const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

async function fixture() {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), 'repoctl-discovery-')))
  roots.push(root)
  const write = async (filename: string, content: string) => {
    await mkdir(path.dirname(path.join(root, filename)), { recursive: true })
    await writeFile(path.join(root, filename), content)
  }
  await write('package.json', '{"name":"root","private":true}')
  await write('packages/z/package.json', '{"name":"z","os":["foreign-os"],"engines":{"node":">=999"}}')
  await write('packages/a/package.yaml', 'name: a\nprivate: true\n')
  await write('packages/b/package.json5', '{name: "b", version: "1.0.0"}')
  await write('packages/skip/package.json', '{"name":"skip"}')
  await write('node_modules/dep/package.json', '{"name":"dep"}')
  await write('bower_components/dep/package.json', '{"name":"bower-dep"}')
  return { root, write }
}

it('discovers all platform manifests with pnpm formats, exclusions and lexical ordering', async () => {
  const { root } = await fixture()
  const packages = await findWorkspacePackages(root, { patterns: ['packages/*', '!packages/skip', 'packages/z'] })
  expect(packages.map(pkg => pkg.manifest.name)).toEqual(['root', 'a', 'b', 'z'])
  expect(packages.at(-1)?.manifest.engines?.node).toBe('>=999')
  expect(packages[1]?.manifest.private).toBe(true)
  expect(packages.every(pkg => typeof pkg.writeProjectManifest === 'function')).toBe(true)
})

it('includes only the root for empty patterns and ignores installed dependency trees by default', async () => {
  const { root } = await fixture()
  expect((await findWorkspacePackages(root, { patterns: [] })).map(pkg => pkg.manifest.name)).toEqual(['root'])
  expect((await findWorkspacePackages(root)).map(pkg => pkg.manifest.name)).toEqual(['root', 'a', 'b', 'skip', 'z'])
})

it('preserves lexical symlink paths alongside real paths for destructive command guards', async () => {
  const { root } = await fixture()
  const link = path.join(root, 'linked')
  await symlink(path.join(root, 'packages/z'), link, process.platform === 'win32' ? 'junction' : 'dir')
  const packages = await findWorkspacePackages(root, { patterns: ['linked'] })
  expect(packages[1]).toMatchObject({ rootDir: link, rootDirRealPath: path.join(root, 'packages/z') })
})

it('rejects malformed manifests instead of hiding discovery errors', async () => {
  const { root, write } = await fixture()
  await write('packages/b/package.json5', '{broken:')
  await expect(findWorkspacePackages(root)).rejects.toThrow()
})
