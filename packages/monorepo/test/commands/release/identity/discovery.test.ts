import { rm } from 'node:fs/promises'
import path from 'pathe'
import { afterEach, expect, it } from 'vitest'
import { changelogFile, cleanupIdentityFixtures, createIdentityFixture, ledgerFile, manifestFile, packageName } from './fixture'

afterEach(cleanupIdentityFixtures)

it('attributes an unchanged initial version to committed preparation, past later ledger and manifest edits', async () => {
  const h = await createIdentityFixture()
  await h.ledger()
  await h.write(changelogFile, '# Initial release\n')
  const source = h.commit('prepare initial release without changing its version')
  await h.ledger('1.0.0', 'other-package@2.0.0: [later]\n')
  h.commit('prepare another package')
  await h.manifest('1.0.0', { description: 'later maintenance' })
  h.commit('edit package metadata')

  expect(source).not.toBe(h.initial)
  await expect(h.inspect(source)).resolves.toEqual([{ name: packageName, version: '1.0.0' }])
})

it('finds preparation when that commit creates the ledger file', async () => {
  const h = await createIdentityFixture()
  await rm(path.join(h.cwd, ledgerFile))
  h.commit('remove empty ledger')
  await h.ledger()
  await h.write(changelogFile, '# Initial release\n')
  const source = h.commit('prepare initial release')
  await expect(h.inspect(source)).resolves.toEqual([{ name: packageName, version: '1.0.0' }])
})

it('refuses an uncommitted ledger entry instead of falling back to an older matching manifest', async () => {
  const h = await createIdentityFixture()
  await h.ledger()
  await expect(h.inspect(h.initial)).rejects.toThrow(`Cannot find prepared release commit for ${packageName}@1.0.0`)
})

it('validates the manifest at the ledger introduction rather than accepting an inconsistent entry', async () => {
  const h = await createIdentityFixture()
  await h.ledger('1.0.1')
  const source = h.commit('record an inconsistent prepared version')
  await h.manifest('1.0.1')
  h.commit('change version later')
  await expect(h.inspect(source)).rejects.toThrow(`Original commit does not contain ${packageName}@1.0.1`)
})

it.each(['ledger', 'manifest'] as const)('uses the merge commit where %s preparation first enters the mainline', async (identity) => {
  const h = await createIdentityFixture()
  h.git('checkout', '-b', 'release')
  if (identity === 'ledger') {
    await h.ledger()
  }
  else {
    await h.manifest('1.0.1')
  }
  await h.write(changelogFile, '# Prepared release\n')
  const branchSource = h.commit('prepare release on a branch')
  h.git('checkout', 'main')
  await h.write('README.md', '# Mainline work\n')
  h.commit('advance mainline')
  h.git('merge', '--no-ff', 'release', '-m', 'merge release preparation')
  const source = h.git('rev-parse', 'HEAD')
  expect(source).not.toBe(branchSource)
  await expect(h.inspect(source)).resolves.toEqual([{ name: packageName, version: identity === 'ledger' ? '1.0.0' : '1.0.1' }])
})

it('uses manifest history for propagated versions absent from the ledger', async () => {
  const h = await createIdentityFixture()
  await h.manifest('1.0.1')
  await h.write(changelogFile, '# Updated dependency\n')
  await h.write(ledgerFile, 'dependency@2.0.0: [dependency-update]\n')
  const source = h.commit('propagate dependency version')
  await h.manifest('1.0.1', { description: 'later metadata' })
  h.commit('edit manifest after preparation')
  await expect(h.inspect(source)).resolves.toEqual([{ name: packageName, version: '1.0.1' }])
})

it('stops manifest history at a removed package instead of reading a nonexistent historical file', async () => {
  const h = await createIdentityFixture()
  await rm(path.join(h.cwd, manifestFile))
  h.commit('remove package')
  await h.manifest()
  const source = h.commit('restore package')
  await expect(h.inspect(source)).resolves.toEqual([{ name: packageName, version: '1.0.0' }])
})

it('rejects source discovery from a shallow checkout', async () => {
  const h = await createIdentityFixture()
  await h.ledger()
  const source = h.commit('prepare initial version')
  await expect(h.inspect(source, { cwd: await h.shallow() })).rejects.toThrow('fetch-depth: 0')
})
