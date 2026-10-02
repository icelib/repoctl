import { lstat, mkdir, mkdtemp, readdir, readFile, readlink, realpath, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'pathe'

export async function createCleanFixture() {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), 'repoctl-clean-')))
  const workspace = path.join(root, 'workspace')
  const home = path.join(root, 'home')
  const retained = ['README.zh-CN.md', 'docs/plans/design.md', '.qoder/rules.md']
  const skills = ['.codex', '.claude', '.cursor', '.agents', '.grok'].map(dir => `${dir}/skills/repoctl/SKILL.md`)
  for (const file of [...retained.map(file => path.join(workspace, file)), ...skills.map(file => path.join(home, file))]) {
    await mkdir(path.dirname(file), { recursive: true })
    await writeFile(file, 'preserve this content')
  }
  await writeFile(path.join(workspace, 'pnpm-workspace.yaml'), 'packages:\n  - packages/**\n')
  await writeFile(path.join(workspace, 'package.json'), JSON.stringify({
    name: 'fixture',
    private: true,
    devDependencies: { '@icebreakers/monorepo': '^1.0.0', 'repoctl': '^5.6.0', 'other': '^1.0.0' },
  }, null, 2))
  for (const name of ['a', 'b']) {
    const dir = path.join(workspace, 'packages', name)
    await mkdir(dir, { recursive: true })
    await writeFile(path.join(dir, 'package.json'), JSON.stringify({ name: `pkg-${name}`, version: '1.0.0', private: name === 'b' }))
    await writeFile(path.join(dir, 'index.js'), `export const value = '${name}'`)
  }
  return { root, workspace, home, retained, skills }
}

export async function snapshotTree(root: string): Promise<Record<string, string>> {
  const result: Record<string, string> = {}
  async function walk(dir: string) {
    for (const name of (await readdir(dir)).sort()) {
      const file = path.join(dir, name)
      const entry = await lstat(file)
      const relative = path.relative(root, file)
      if (entry.isSymbolicLink()) {
        result[relative] = `link:${await readlink(file)}`
      }
      else if (entry.isDirectory()) {
        await walk(file)
      }
      else {
        result[relative] = `${entry.mtimeMs}:${await readFile(file, 'utf8')}`
      }
    }
  }
  await walk(root)
  return result
}
