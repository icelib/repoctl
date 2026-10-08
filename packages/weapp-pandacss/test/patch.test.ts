import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { inject, patch } from '@/core/patch'

const fixtureRoot = path.resolve(__dirname, 'fixtures/app/styled-system')

describe('patch', () => {
  it('patches the Panda 0.x createCss factory', async () => {
    const content = await fs.readFile(path.join(fixtureRoot, 'helpers.mjs'), 'utf8')
    const result = inject(content).code

    expect(result).toContain('from "./weapp-panda/index.mjs"')
    expect(result).toContain('__weappPandaOriginal_createCss')
    expect(result).toContain('Object.defineProperties')
  })

  it('patches the Panda 2 createSerializeCss factory', async () => {
    const content = await fs.readFile(path.join(fixtureRoot, 'helpers.panda2.mjs'), 'utf8')
    const result = inject(content).code

    expect(result).toContain('from "./weapp-panda/index.mjs"')
    expect(result).toContain('__weappPandaOriginal_createSerializeCss')
    expect(result).toContain('escape(serializer(...styles))')
  })

  it('is idempotent for both generated shapes', async () => {
    for (const filename of ['helpers.mjs', 'helpers.panda2.mjs']) {
      const content = await fs.readFile(path.join(fixtureRoot, filename), 'utf8')
      const first = inject(content).code
      expect(inject(first).code).toBe(first)
    }
  })

  it('writes a patched file without mutating the source', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'weapp-panda-'))
    try {
      const source = path.join(root, 'helpers.mjs')
      const target = path.join(root, 'patched.mjs')
      const content = await fs.readFile(path.join(fixtureRoot, 'helpers.panda2.mjs'), 'utf8')
      await fs.writeFile(source, content)
      await patch(source, target)

      expect(await fs.readFile(source, 'utf8')).toBe(content)
      expect(await fs.readFile(target, 'utf8')).toContain('__weappPandaOriginal_createSerializeCss')
    }
    finally {
      await fs.rm(root, { recursive: true, force: true })
    }
  })

  it('escapes classes returned by the Panda 2 serializer', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'weapp-panda-'))
    try {
      const content = await fs.readFile(path.join(fixtureRoot, 'helpers.panda2.mjs'), 'utf8')
      const patched = inject(content).code
      const helper = path.join(root, 'helpers.mjs')
      await fs.writeFile(helper, patched)
      await fs.mkdir(path.join(root, 'weapp-panda'))
      await fs.writeFile(
        path.join(root, 'weapp-panda/index.mjs'),
        'export const escape = value => "escaped(" + value + ")"\n',
      )

      const runtime = await import(`${pathToFileURL(helper).href}?test=${Date.now()}`) as {
        createSerializeCss: (context: Record<string, unknown>) => (styles: Record<string, unknown>) => string
      }
      const serialize = runtime.createSerializeCss({
        hash: false,
        conditions: {
          shift: (paths: string[]) => paths,
          finalize: (paths: string[]) => paths,
          breakpoints: { keys: [] },
        },
        utility: {
          prefix: null,
          hasShorthand: false,
          toHash: () => 'hash',
          transform: (prop: string, value: string) => ({ className: `${prop}_${value}` }),
          resolveShorthand: (prop: string) => prop,
        },
      })

      expect(serialize({ color: 'red' })).toBe('escaped(color_red)')
    }
    finally {
      await fs.rm(root, { recursive: true, force: true })
    }
  })

  it('rejects unknown generated helper shapes', () => {
    expect(() => inject('export const helper = true')).toThrow('createSerializeCss/createCss')
  })
})
