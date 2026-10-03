import { Buffer } from 'node:buffer'
import { expect, it } from 'vitest'

const { validateMaintenanceLanes } = await import(new URL('../../../../resources/maintenance/migration-lanes.mjs', import.meta.url).href)
function validate(tag: string, lane: string, manifest = 'package.json') {
  const files = new Map([
    ['pnpm-workspace.yaml', Buffer.from('packages:\n  - \'packages/*\'\n')],
    [`packages/public/${manifest}`, Buffer.from('{"name":"public","version":"1.0.0"}')],
  ])
  validateMaintenanceLanes({
    read: (filename: string) => files.get(filename) ?? null,
    sourcePaths: files.keys(),
    operation: { status: 'modify', content: Buffer.from(`packages:\n  - 'packages/*'\nversioning:\n  lanes:\n    public: ${lane}\n`).toString('base64') },
    tag,
    Buffer,
    fail: (message: string) => {
      throw new Error(message)
    },
  })
}
it.each(['true', '1'])('requires a string-valued lane for the tag %s', (tag) => {
  expect(() => validate(tag, `'${tag}'`)).not.toThrow()
  expect(() => validate(tag, tag)).toThrow('canonical workspace evidence')
})
it.each(['package.yaml', 'package.json5'])('requires manual review for an unsupported manifest: %s', (manifest) => {
  expect(() => validate('beta', 'beta', manifest)).toThrow('canonical workspace evidence')
})
