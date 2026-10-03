import { rm } from 'node:fs/promises'
import path from 'pathe'
import { afterEach, expect, it } from 'vitest'
import { changelogFile, cleanupIdentityFixtures, createIdentityFixture, packageName } from './fixture'

afterEach(cleanupIdentityFixtures)

it.each([
  { original: undefined, current: undefined, valid: true, name: 'absent on both sides' },
  { original: '# Release\n', current: '# Release\n', valid: true, name: 'identical contents' },
  { original: '# Release\n\n- Change\n', current: '# Release\r\n\r\n- Change\r\n', valid: true, name: 'CRLF normalization' },
  { original: '# Release\n', current: undefined, valid: false, name: 'deleted from the current checkout' },
  { original: undefined, current: '# Release\n', valid: false, name: 'absent from the original commit' },
  { original: '# Release\n', current: '# Changed release\n', valid: false, name: 'different contents' },
  { original: '', current: undefined, valid: false, name: 'an empty original file removed' },
  { original: undefined, current: '', valid: false, name: 'an empty file added' },
])('validates changelog identity with $name', async ({ original, current, valid }) => {
  const h = await createIdentityFixture()
  await h.ledger()
  if (original !== undefined) {
    await h.write(changelogFile, original)
  }
  const source = h.commit('prepare initial release')
  if (current === undefined) {
    await rm(path.join(h.cwd, changelogFile), { force: true })
  }
  else {
    await h.write(changelogFile, current)
  }
  const result = h.inspect(source)
  if (valid) {
    await expect(result).resolves.toEqual([{ name: packageName, version: '1.0.0' }])
  }
  else {
    await expect(result).rejects.toThrow(`Changelog differs from original commit for ${packageName}`)
  }
})
