import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'

const run = promisify(execFile)
const bin = path.resolve(__dirname, '../bin/weapp-pandacss.js')

describe('CLI', () => {
  it('lists codegen, rollback, and init commands', async () => {
    const result = await run(process.execPath, [bin, '--help'])
    expect(result.stdout).toContain('codegen')
    expect(result.stdout).toContain('rollback')
    expect(result.stdout).toContain('init')
  })

  it('initializes a config without requiring Panda config first', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'weapp-panda-cli-'))
    try {
      const result = await run(process.execPath, [bin, 'init'], { cwd: root })
      expect(result.stdout).toContain('config initialized')
      await expect(
        fs.readFile(path.join(root, 'weapp-pandacss.config.ts'), 'utf8'),
      ).resolves.toContain('defineConfig')
    }
    finally {
      await fs.rm(root, { recursive: true, force: true })
    }
  })

  it('runs codegen and rollback against Panda runtime files', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'weapp-panda-cli-'))
    try {
      await fs.symlink(
        path.resolve(__dirname, '../node_modules'),
        path.join(root, 'node_modules'),
        'dir',
      )
      await fs.writeFile(
        path.join(root, 'panda.config.ts'),
        `import { defineConfig } from '@pandacss/dev'\n\nexport default defineConfig({ outdir: 'styled-system', outExtension: 'mjs' })\n`,
      )
      await fs.mkdir(path.join(root, 'styled-system'), { recursive: true })
      const helper = path.join(root, 'styled-system/helpers.mjs')
      const original = await fs.readFile(
        path.resolve(__dirname, 'fixtures/app/styled-system/helpers.panda2.mjs'),
        'utf8',
      )
      await fs.writeFile(helper, original)

      await run(process.execPath, [bin, 'codegen'], { cwd: root })
      await expect(fs.readFile(helper, 'utf8')).resolves.toContain(
        '__weappPandaOriginal_createSerializeCss',
      )
      await expect(
        fs.readFile(path.join(root, 'styled-system/_helpers.backup.mjs'), 'utf8'),
      ).resolves.toBe(original)

      await run(process.execPath, [bin, 'rollback'], { cwd: root })
      await expect(fs.readFile(helper, 'utf8')).resolves.toBe(original)
    }
    finally {
      await fs.rm(root, { recursive: true, force: true })
    }
  })
})
