import type { WorkspacePackageManifest } from '@icebreakers/monorepo'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readdir, readFile, realpath, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

export async function writePackage(cwd: string, directory: string, manifest: WorkspacePackageManifest) {
  await mkdir(path.join(cwd, directory), { recursive: true })
  await writeFile(path.join(cwd, directory, 'package.json'), JSON.stringify({ version: '1.0.0', ...manifest }))
}

export async function fixture(packages: Record<string, WorkspacePackageManifest>, root: WorkspacePackageManifest = {}) {
  const cwd = await realpath(await mkdtemp(path.join(tmpdir(), 'repo-workspace-graph-')))
  await writeFile(path.join(cwd, 'pnpm-workspace.yaml'), 'packages:\n  - packages/*\n  - apps/*\n  - "!packages/excluded"\n')
  await writePackage(cwd, '.', { name: 'fixture-root', private: true, ...root })
  for (const [directory, manifest] of Object.entries(packages)) {
    await writePackage(cwd, directory, manifest)
  }
  return cwd
}

export const diamond = {
  'apps/web': { name: '@test/web', private: true, dependencies: { '@test/a': 'workspace:*', '@test/b': 'workspace:*' } },
  'packages/a': { name: '@test/a', dependencies: { '@test/base': '^1.0.0' } },
  'packages/b': { name: '@test/b', dependencies: { '@test/base': 'workspace:^' } },
  'packages/base': { name: '@test/base', devDependencies: { '@test/a': 'workspace:*' } },
  'packages/tool': { name: '@test/tool', peerDependencies: { '@test/base': 'workspace:~' } },
  'packages/isolated': { name: '@test/isolated' },
}

export function cli(cwd: string, args: string[]) {
  const entry = fileURLToPath(new URL('../../../../repoctl/bin/repo.js', import.meta.url))
  return execFileSync(process.execPath, [entry, 'workspace', ...args], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
}

export async function fingerprint(cwd: string) {
  const files: Array<[string, string, number]> = []
  async function visit(directory: string) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const filename = path.join(directory, entry.name)
      if (entry.isDirectory()) {
        await visit(filename)
      }
      else {
        files.push([path.relative(cwd, filename), createHash('sha256').update(await readFile(filename)).digest('hex'), (await stat(filename)).mtimeMs])
      }
    }
  }
  await visit(cwd)
  return files.sort(([a], [b]) => a.localeCompare(b))
}
