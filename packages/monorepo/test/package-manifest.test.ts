import { readFile } from 'node:fs/promises'
import { expect, it } from 'vitest'

interface PackageManifest {
  dependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
  peerDependenciesMeta?: Record<string, { optional?: boolean }>
}

async function readManifest(url: URL): Promise<PackageManifest> {
  return JSON.parse(await readFile(url, 'utf8')) as PackageManifest
}

it('keeps Vitest optional and version-agnostic in both published packages', async () => {
  const [monorepo, repoctl] = await Promise.all([
    readManifest(new URL('../package.json', import.meta.url)),
    readManifest(new URL('../../repoctl/package.json', import.meta.url)),
  ])

  for (const manifest of [monorepo, repoctl]) {
    expect(manifest.peerDependencies?.['vitest']).toBe('*')
    expect(manifest.peerDependenciesMeta?.['vitest']?.optional).toBe(true)
  }
  expect(monorepo.dependencies).not.toHaveProperty('vitest')
})
