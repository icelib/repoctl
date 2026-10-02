import { execFile } from 'node:child_process'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'
import { expect, it } from 'vitest'
import { entry, fixture } from './fixtures'

async function failReplacement(root: string, concurrent = false) {
  const script = `
    import fs from 'node:fs/promises'
    import path from 'node:path'
    import { syncBuiltinESMExports } from 'node:module'
    const [root, entry, concurrent] = process.argv.slice(1)
    const rename = fs.rename
    fs.rename = async (source, target) => {
      if (source.endsWith('.tmp') && target.endsWith('card.test.tsx')) {
        if (concurrent === 'true') await fs.writeFile(path.join(root, 'packages/react/src/components/card.tsx'), 'concurrent business edit\\n')
        throw new Error('Injected generator replacement failure')
      }
      return rename(source, target)
    }
    syncBuiltinESMExports()
    const { applyGeneratePlan, planGenerate } = await import(entry)
    try {
      await applyGeneratePlan(await planGenerate({cwd: root, package: 'packages/react', generator: 'react-component', parameters: {name: 'card', export: true}}))
      throw new Error('unexpected success')
    } catch (error) { process.stdout.write(error.message) }
  `
  return (await promisify(execFile)(process.execPath, ['--input-type=module', '-e', script, root, pathToFileURL(entry).href, String(concurrent)])).stdout
}

it('restores the barrel and removes owned new files after a partial apply fails', async (t) => {
  const root = await fixture(t)
  const barrel = path.join(root, 'packages/react/src/index.ts')
  const original = await readFile(barrel, 'utf8')
  expect(await failReplacement(root)).toContain('Injected generator replacement failure')
  expect(await readFile(barrel, 'utf8')).toBe(original)
  expect(await readdir(path.join(root, 'packages/react/src'))).toEqual(['index.ts'])
  expect(await readdir(path.join(root, 'packages/react'))).toEqual(expect.arrayContaining(['package.json', 'src']))
})

it('preserves concurrent edits and recovery backups when automatic rollback is unsafe', async (t) => {
  const root = await fixture(t)
  expect(await failReplacement(root, true)).toContain('preserve recovery files')
  expect(await readFile(path.join(root, 'packages/react/src/components/card.tsx'), 'utf8')).toBe('concurrent business edit\n')
  expect((await readdir(path.join(root, 'packages/react/src/components'))).some(file => file.endsWith('.bak'))).toBe(true)
})
