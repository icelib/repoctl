import crypto from 'node:crypto'
import CI from 'ci-info'
import path from 'pathe'
import { vi } from 'vitest'
import { logger } from '@/core/logger'
import fs from '@/utils/fs'
import { getFileHash, isFileChanged } from '@/utils/hash'

// windows 和 linux/macos 计算不一致，应该是 \r\n 和 \n 导致的
describe.skipIf(CI.isCI)('md5', () => {
  const testFilePath = path.resolve(import.meta.dirname, '../.gitignore')
  it('getFileHash', async () => {
    expect(
      getFileHash(await fs.readFile(
        testFilePath,
        'binary',
      )),
    ).toBeTypeOf('string')
  })

  it('isFileChanged case 0', async () => {
    const str = await fs.readFile(
      testFilePath,
      'utf8',
    )
    expect(
      isFileChanged(
        str,
        `${str}\n`,
      ),
    ).toBe(true)
  })

  it('isFileChanged case 1', async () => {
    const str = await fs.readFile(
      testFilePath,
      'utf8',
    )
    expect(
      isFileChanged(
        str,
        str,
      ),
    ).toBe(false)
  })

  it('isFileChanged case 2', async () => {
    const str = await fs.readFile(
      testFilePath,
      'utf8',
    )
    const strBuf = await fs.readFile(
      testFilePath,
    )
    expect(
      isFileChanged(
        str,
        strBuf,
      ),
    ).toBe(false)
  })
})

describe('md5 error handling', () => {
  it('isFileChanged logs and returns false on hashing errors', () => {
    const createHashSpy = vi.spyOn(crypto, 'createHash').mockImplementation(() => {
      throw new Error('hash failure')
    })
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => undefined)

    expect(isFileChanged('a', 'b')).toBe(false)
    expect(errorSpy).toHaveBeenCalled()

    createHashSpy.mockRestore()
    errorSpy.mockRestore()
  })
})
