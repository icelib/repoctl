import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { expect, it } from 'vitest'
import { contents, fixture, write } from './fixtures'

const run = promisify(execFile)
const cli = fileURLToPath(new URL('../../../bin/repo.js', import.meta.url))

it('supports JSON preview, explicit apply and instance queries through the delivered CLI', async (t) => {
  const f = await fixture(t)
  await write(f.sourceDir, 'template-data.mjs', 'throw new Error("Historical package code must never execute")\n')
  const args = ['templates', 'link', f.target, '--template', 'tsdown', '--source-version', '1.2.3', '--source-dir', f.sourceDir, '--json']
  const before = await contents(f.cwd)
  const preview = await run(process.execPath, [cli, ...args], { cwd: f.cwd })
  expect(JSON.parse(preview.stdout).action).toBe('register')
  expect(await contents(f.cwd)).toEqual(before)
  await run(process.execPath, [cli, ...args, '--out', 'link-plan.json'], { cwd: f.cwd })
  expect(JSON.parse(await fs.readFile(path.join(f.cwd, 'link-plan.json'), 'utf8')).action).toBe('register')
  const applied = await run(process.execPath, [cli, ...args, '--apply'], { cwd: f.cwd })
  expect(JSON.parse(applied.stdout).applied).toBe(true)
  const inventory = JSON.parse((await run(process.execPath, [cli, 'templates', 'instances', '--json'], { cwd: f.cwd })).stdout)
  expect(inventory.instances[0].instance.target).toBe(f.target)
  const reconstructed = path.join(f.root, 'cli-baseline')
  await run(process.execPath, [cli, 'templates', 'rebuild-baseline', f.target, '--destination', reconstructed], { cwd: f.cwd })
  expect(await fs.readFile(path.join(reconstructed, 'src/index.ts'), 'utf8')).toContain('original template')
})
