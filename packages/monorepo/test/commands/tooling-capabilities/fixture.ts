import type { ToolingCapabilityOptions } from '@icebreakers/monorepo'
import { mkdir, mkdtemp, readdir, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'pathe'
import { afterEach } from 'vitest'

const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})
export const options: ToolingCapabilityOptions = { capability: 'playwright', target: 'web', interaction: { route: '/', click: { role: 'button', name: 'Increment' }, expectText: 'Count: 1' } }
export async function fixture() {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), 'repoctl-capability-')))
  roots.push(root)
  const write = async (file: string, content: string) => {
    await mkdir(path.dirname(path.join(root, file)), { recursive: true })
    await writeFile(path.join(root, file), content)
  }
  await write('package.json', JSON.stringify({ name: 'root', private: true, devDependencies: { turbo: '^2.11.6' } }))
  await write('pnpm-workspace.yaml', '# retained workspace comment\npackages: [apps/*]\n')
  await write('turbo.json', '{"tasks":{"build":{"outputs":["dist/**"]}}}\n')
  await write('apps/web/package.json', JSON.stringify({ name: 'web', private: true, scripts: { build: 'vite build', preview: 'vite preview' }, dependencies: { vue: '^3.5.0' }, devDependencies: { vite: '^8.0.0' } }))
  await write('apps/web/business.ts', 'export const userOwned = true\n')
  const snapshot = async () => {
    const result: Record<string, string> = {}
    const visit = async (directory: string) => {
      for (const entry of await readdir(path.join(root, directory), { withFileTypes: true })) {
        const file = path.join(directory, entry.name)
        if (entry.isDirectory()) {
          await visit(file)
        }
        else { result[file] = (await readFile(path.join(root, file))).toString('base64') }
      }
    }
    await visit('')
    return result
  }
  return { root, write, snapshot }
}
