import { readFile } from 'node:fs/promises'
import path from 'pathe'
import { expect, it } from 'vitest'
import { probeLargeIdentity } from '../../helpers/large-file-identity'
import { fixture } from './fixtures'

it.for(['dev', 'ino'] as const)('preserves a replacement registry after a failed placeholder write with distinct large %s', async (field, t) => {
  const root = await fixture(t)
  const registry = path.join(root, '.repoctl/typescript-references.json')
  const before = await readFile(path.join(root, 'tsconfig.json'), 'utf8')
  const output = await probeLargeIdentity(root, field, 'path.resolve(filename) === path.resolve(root, \'.repoctl/typescript-references.json\')', `
    const identityOpen = fs.open
    fs.open = async (filename, ...args) => {
      const handle = await identityOpen(filename, ...args)
      if (tracked(filename) && args[0] === 'wx') {
        handle.writeFile = async () => {
          await handle.close()
          await fs.rename(filename, filename + '.retained')
          await fs.copyFile(filename + '.retained', filename)
          replaced = true
          throw new Error('Injected placeholder write failure')
        }
      }
      return handle
    }
  `, `
    try {
      await api.applyProjectReferencesPlan(await api.planProjectReferences(root))
      throw new Error('Unexpected success')
    } catch (error) { process.stdout.write(error.message) }
  `)
  expect(output).toContain('preserve recovery files')
  expect(await readFile(registry, 'utf8')).toBe('')
  expect(await readFile(`${registry}.retained`, 'utf8')).toBe('')
  expect(await readFile(path.join(root, 'tsconfig.json'), 'utf8')).toBe(before)
})
