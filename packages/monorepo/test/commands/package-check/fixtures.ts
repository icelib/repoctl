import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

export async function fixture() {
  const cwd = await mkdtemp(path.join(tmpdir(), 'repoctl package fixture-'))
  const root = JSON.parse(await readFile(new URL('../../../../../package.json', import.meta.url), 'utf8'))
  await writeFile(path.join(cwd, 'package.json'), JSON.stringify({ name: 'fixture', private: true, packageManager: root.packageManager }))
  await writeFile(path.join(cwd, 'pnpm-workspace.yaml'), 'packages:\n  - packages/*\n')
  return cwd
}

export async function addPackage(cwd: string, name: string, manifest: Record<string, unknown>, files: Record<string, string>) {
  const directory = path.join(cwd, 'packages', name)
  await mkdir(directory, { recursive: true })
  await writeFile(path.join(directory, 'package.json'), JSON.stringify({
    name,
    version: '1.0.0',
    type: 'module',
    license: 'MIT',
    files: ['dist'],
    scripts: { build: 'node build.cjs' },
    ...manifest,
  }))
  const script = `const fs = require('node:fs'); const path = require('node:path');
for (const [file, content] of Object.entries(${JSON.stringify(files)})) {
  fs.mkdirSync(path.dirname(file), {recursive: true}); fs.writeFileSync(file, content);
}
fs.writeFileSync('built-marker', 'built');`
  await writeFile(path.join(directory, 'build.cjs'), script)
  return directory
}
