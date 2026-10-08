import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { getPandacssConfig } from '@/core'
import {
  copyEscape,
  findPandaRuntime,
  getPandaVersion,
  getWeappCoreEscapeDir,
} from '@/core/codegen'
import { appRoot } from './util'

describe('codegen', () => {
  it('finds the installed WeappCore escape runtime', () => {
    expect(getWeappCoreEscapeDir()).toContain('@weapp-core')
  })

  it('copies the escape runtime into the generated system', async () => {
    const { config } = await getPandacssConfig({
      cwd: appRoot,
    })
    const target = await fs.mkdtemp(path.join(os.tmpdir(), 'weapp-panda-'))

    try {
      const res = await copyEscape(target)
      expect(res).toHaveLength(4)
      for (const filename of res) {
        await expect(fs.stat(filename)).resolves.toBeDefined()
      }
      expect((config['outdir'] as string)).toContain('src/styled-system')
    }
    finally {
      await fs.rm(target, { recursive: true, force: true })
    }
  })

  it('reports the pinned Panda version', () => {
    expect(getPandaVersion()).toBe('2.1.2')
  })

  it.each(['mjs', 'js'] as const)('detects helpers.%s', async (extension) => {
    const target = await fs.mkdtemp(path.join(os.tmpdir(), 'weapp-panda-'))
    try {
      await fs.writeFile(path.join(target, `helpers.${extension}`), '')
      const runtime = await findPandaRuntime(target)
      expect(runtime.extension).toBe(extension)
      expect(runtime.backupPath).toContain(`_helpers.backup.${extension}`)
    }
    finally {
      await fs.rm(target, { recursive: true, force: true })
    }
  })

  it('rejects a TypeScript-only runtime', async () => {
    const target = await fs.mkdtemp(path.join(os.tmpdir(), 'weapp-panda-'))
    try {
      await fs.writeFile(path.join(target, 'helpers.ts'), '')
      await expect(findPandaRuntime(target)).rejects.toThrow('outExtension')
    }
    finally {
      await fs.rm(target, { recursive: true, force: true })
    }
  })
})
