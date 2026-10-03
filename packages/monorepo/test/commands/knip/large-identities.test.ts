import { readFile } from 'node:fs/promises'
import path from 'pathe'
import { expect, it } from 'vitest'
import { probeLargeIdentity } from '../../helpers/large-file-identity'
import { emitPayload, fakeTool, fixture, nativePayload } from './fixture'

it.each(['dev', 'ino'] as const)('retains a same-byte replacement baseline temporary file with distinct large %s', async (field) => {
  const h = await fixture({ tool: false })
  await fakeTool(h.workspace, emitPayload(nativePayload()))
  const output = await probeLargeIdentity(h.workspace, field, 'String(filename).includes(\'baseline.json.repoctl-knip-\')', `
    const originalLink = fs.link
    fs.link = async (source, target) => {
      await originalLink(source, target)
      await fs.rename(source, source + '.retained')
      await fs.copyFile(source + '.retained', source)
      replaced = true
    }
  `, `
    const report = await api.runKnipCheck(root)
    process.stdout.write(JSON.stringify(await api.saveKnipBaseline(root, report, 'baseline.json')))
  `)
  const result = JSON.parse(output)
  expect(result.status).toBe('created')
  expect(result.cleanupPending).toHaveLength(1)
  const content = await readFile(path.join(h.workspace, 'baseline.json'), 'utf8')
  expect(await readFile(result.cleanupPending[0], 'utf8')).toBe(content)
  expect(await readFile(`${result.cleanupPending[0]}.retained`, 'utf8')).toBe(content)
})
