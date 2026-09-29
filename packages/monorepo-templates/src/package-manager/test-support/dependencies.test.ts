import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'
import { expect, it } from 'vitest'
import { linkDependencies } from './dependencies'

const execFileAsync = promisify(execFile)

it('resolves local and hoisted dependencies with their own dependency graph and preserves them on cleanup', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'repoctl-fixture-dependencies-'))
  const source = path.join(root, 'source/packages/templates')
  const consumer = path.join(root, 'consumer')
  const local = path.join(source, 'node_modules/@fixture/local')
  const hoisted = path.join(root, 'source/node_modules/hoisted')
  const nested = path.join(hoisted, 'node_modules/nested')

  try {
    for (const directory of [local, nested, consumer]) {
      await mkdir(directory, { recursive: true })
    }
    await writeFile(path.join(source, 'package.json'), JSON.stringify({
      dependencies: { '@fixture/local': '1.0.0', 'hoisted': '1.0.0' },
    }))
    for (const [directory, content] of [
      [local, 'export default "local"'],
      [hoisted, 'export { default } from "nested"'],
      [nested, 'export default "nested"'],
    ] as const) {
      await writeFile(path.join(directory, 'package.json'), JSON.stringify({ type: 'module', exports: './index.js' }))
      await writeFile(path.join(directory, 'index.js'), content)
    }
    await linkDependencies(source, consumer)
    const entry = path.join(consumer, 'index.mjs')
    await writeFile(entry, 'import local from "@fixture/local"; import hoisted from "hoisted"; process.stdout.write(local + ":" + hoisted)')
    const { stdout } = await execFileAsync(process.execPath, [
      '--input-type=module',
      '--eval',
      `import ${JSON.stringify(pathToFileURL(entry).href)}`,
    ], { cwd: consumer })
    expect(stdout).toBe('local:nested')

    await rm(consumer, { recursive: true, force: true })
    expect(await readFile(path.join(local, 'index.js'), 'utf8')).toBe('export default "local"')
    expect(await readFile(path.join(nested, 'index.js'), 'utf8')).toBe('export default "nested"')
  }
  finally {
    await rm(root, { recursive: true, force: true })
  }
})
