import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { captureTemplateSnapshot, compareTemplateSnapshots, prepareTemplateInstanceSource, snapshotDigest, writeTemplateSnapshot } from '@icebreakers/monorepo-templates'
import { expect, it } from 'vitest'
import { fixture, write } from './fixtures'

it('retains deterministic whole-template contents, empty directories and executable files', async (t) => {
  const f = await fixture(t)
  const template = path.join(f.sourceDir, 'templates/tsdown')
  await fs.mkdir(path.join(template, 'empty'))
  await write(template, 'scripts/check.sh', '#!/bin/sh\nexit 0\n')
  await fs.chmod(path.join(template, 'scripts/check.sh'), 0o755)
  const original = await captureTemplateSnapshot(template)
  expect(snapshotDigest(await captureTemplateSnapshot(template))).toBe(snapshotDigest(original))
  const rebuilt = path.join(f.root, 'rebuilt')
  await writeTemplateSnapshot(original, rebuilt)
  expect(await fs.readdir(path.join(rebuilt, 'empty'))).toEqual([])
  expect(await captureTemplateSnapshot(rebuilt)).toEqual(original)
  if (process.platform !== 'win32') {
    expect((await fs.stat(path.join(rebuilt, 'scripts/check.sh'))).mode & 0o111).toBe(0o111)
    await fs.chmod(path.join(rebuilt, 'scripts/check.sh'), 0o644)
    expect(compareTemplateSnapshots(original, await captureTemplateSnapshot(rebuilt))).toEqual([{ path: 'scripts/check.sh', status: 'modified' }])
  }
  await write(template, 'nested/another.ts', 'export const changed = true\n')
  expect(snapshotDigest(await captureTemplateSnapshot(template))).not.toBe(snapshotDigest(original))
})

it('rejects a symbolic-link ancestor even when it resolves inside a historical package', async (t) => {
  const f = await fixture(t)
  await fs.symlink(path.join(f.sourceDir, 'templates'), path.join(f.sourceDir, 'alias'), 'junction')
  await expect(prepareTemplateInstanceSource(path.join(f.sourceDir, 'alias/tsdown'), f.sourceDir)).rejects.toThrow('Symlinks')
})
