import { readFile } from 'node:fs/promises'
import { expect, it } from 'vitest'

interface PackageManifest {
  dependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
  peerDependenciesMeta?: Record<string, { optional?: boolean }>
}

interface PeerContract {
  path: URL
  peers: Record<string, boolean>
  withoutVitestDependency?: boolean
}

async function readManifest(url: URL): Promise<PackageManifest> {
  return JSON.parse(await readFile(url, 'utf8')) as PackageManifest
}

const peerContracts: PeerContract[] = [
  {
    path: new URL('../package.json', import.meta.url),
    peers: {
      '@commitlint/cli': true,
      'eslint': true,
      'stylelint': true,
      'typescript': true,
      'vitest': true,
    },
    withoutVitestDependency: true,
  },
  {
    path: new URL('../../repoctl/package.json', import.meta.url),
    peers: {
      '@commitlint/cli': true,
      'eslint': true,
      'stylelint': true,
      'typescript': true,
      'vitest': true,
    },
  },
  {
    path: new URL('../../commitlint/package.json', import.meta.url),
    peers: {
      'conventional-changelog-conventionalcommits': false,
    },
  },
  {
    path: new URL('../../eslint/package.json', import.meta.url),
    peers: {
      'eslint': false,
      'eslint-plugin-pnpm': true,
      'tailwindcss': true,
    },
  },
  {
    path: new URL('../../stylelint/package.json', import.meta.url),
    peers: {
      stylelint: false,
    },
  },
  {
    path: new URL('../../stylelint-plugin-tailwindcss/package.json', import.meta.url),
    peers: {
      stylelint: false,
      tailwindcss: true,
    },
  },
] as const

it('keeps repoctl runtime peers optional where applicable and version-agnostic', async () => {
  const entries = await Promise.all(
    peerContracts.map(async contract => ({
      contract,
      manifest: await readManifest(contract.path),
    })),
  )

  for (const { contract, manifest } of entries) {
    const { peers, withoutVitestDependency } = contract
    expect(manifest.peerDependencies).toEqual(
      Object.fromEntries(Object.keys(peers).map(name => [name, '*'])),
    )

    for (const [name, optional] of Object.entries(peers)) {
      expect(manifest.peerDependenciesMeta?.[name]?.optional ?? false).toBe(optional)
    }

    if (withoutVitestDependency) {
      expect(manifest.dependencies).not.toHaveProperty('vitest')
    }
  }
})
