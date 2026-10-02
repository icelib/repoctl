import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { expect, it } from 'vitest'
import { contents, originalCode, upgradeFixture, write } from './fixtures'

const run = promisify(execFile)
const cli = fileURLToPath(new URL('../../../../bin/repo.js', import.meta.url))

it('delivers preview, explicit upgrade, persistent exclusions and recovery through the CLI', async (t) => {
  const f = await upgradeFixture(t)
  await write(f.targetDir, 'README.md', 'Business readme\n')
  await write(f.nextSource, 'templates/tsdown/README.md', 'Upstream readme\n')
  await write(f.nextSource, 'templates/tsdown/src/index.ts', originalCode.replace('first = 1', 'first = 2'))
  const args = ['templates', 'upgrade', f.target, '--source-version', '2.0.0', '--source-dir', f.nextSource, '--exclude', 'README.md', '--json']
  const before = await contents(f.cwd)
  const preview = await run(process.execPath, [cli, ...args], { cwd: f.cwd })
  expect(JSON.parse(preview.stdout).action).toBe('upgrade')
  expect(await contents(f.cwd)).toEqual(before)
  await run(process.execPath, [cli, ...args, '--out', 'upgrade-plan.json'], { cwd: f.cwd })
  expect(JSON.parse(await fs.readFile(path.join(f.cwd, 'upgrade-plan.json'), 'utf8')).nextInstance.excludedPaths).toEqual(['README.md'])
  const applied = await run(process.execPath, [cli, ...args, '--apply'], { cwd: f.cwd })
  expect(JSON.parse(applied.stdout).status).toBe('applied')
  expect(await fs.readFile(path.join(f.targetDir, 'README.md'), 'utf8')).toBe('Business readme\n')
  expect(await fs.readFile(path.join(f.targetDir, 'src/index.ts'), 'utf8')).toContain('first = 2')
  const recovery = await run(process.execPath, [cli, 'templates', 'recover-upgrade', f.target, '--json'], { cwd: f.cwd })
  expect(JSON.parse(recovery.stdout).status).toBe('no-pending-upgrade')
})
