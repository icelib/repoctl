import { tmpdir } from 'node:os'
import path from 'pathe'
import { afterEach } from 'vitest'
import fs from '@/utils/fs'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => fs.remove(root)))
})

export async function createTempWorkspace(prefix: string) {
  const root = await fs.mkdtemp(path.join(tmpdir(), prefix))
  roots.push(root)
  return root
}

export async function recordInstallation(root: string) {
  const manifest = await fs.readJson<Record<string, unknown>>(path.join(root, 'package.json'))
  await fs.writeJson(path.join(root, 'package.json'), { ...manifest, packageManager: 'pnpm@12.8.1' })
  const devDependencies = Object.fromEntries(Object.entries(manifest['devDependencies'] as Record<string, string> ?? {}).map(([name, specifier]) => [name, { specifier, version: specifier.replace(/^\^/u, '') }]))
  const lockfile = {
    lockfileVersion: '9.0',
    importers: {
      '.': { devDependencies },
      'packages/demo': {},
    },
  }
  await fs.outputFile(path.join(root, 'pnpm-lock.yaml'), JSON.stringify(lockfile))
  await fs.outputFile(path.join(root, 'node_modules/.pnpm/lock.yaml'), JSON.stringify(lockfile))
  for (const [name, dependency] of Object.entries(devDependencies)) {
    await fs.outputJson(path.join(root, 'node_modules', name, 'package.json'), { name, version: dependency.version })
  }
  await fs.outputJson(path.join(root, 'node_modules/.modules.yaml'), {
    packageManager: 'pnpm@12.8.1',
    layoutVersion: 5,
    virtualStoreDir: '.pnpm',
    included: { dependencies: true, devDependencies: true, optionalDependencies: true },
  })
}
