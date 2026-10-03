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

it('uses the delivered --data contract for redacted previews and conditional generation', async (t) => {
  const f = await fixture(t)
  await write(f.cwd, 'answers.json', JSON.stringify({ ...f.options.parameters, tests: false }))
  const args = ['new', f.options.name, '--template', 'custom', '--data', 'answers.json']
  const before = await contents(f.cwd)
  const preview = await run(process.execPath, [cli, ...args, '--dry-run', '--json'], { cwd: f.cwd })
  expect(preview.stdout + preview.stderr).not.toContain('secret-value-734')
  expect(JSON.parse(preview.stdout).parameterization.values.token).toBe('[redacted]')
  expect(await contents(f.cwd)).toEqual(before)
  const result = await run(process.execPath, [cli, ...args], { cwd: f.cwd })
  expect(result.stdout + result.stderr).not.toContain('secret-value-734')
  expect(await fs.readFile(path.join(f.target, 'credentials.local'), 'utf8')).toBe('TOKEN=secret-value-734\n')
  await expect(fs.access(path.join(f.target, 'test/index.mjs'))).rejects.toThrow()
})

it('reports invalid JSON, unknown keys and missing required values without echoing the data', async (t) => {
  const f = await fixture(t)
  for (const data of ['{"secret-value-734":', '{"token":"secret-value-734","tests":"false"}', '{"unknown":"secret-value-734"}', '{}']) {
    await write(f.cwd, 'answers.json', data)
    const before = await contents(f.cwd)
    const error = await run(process.execPath, [cli, 'new', f.options.name, '--template', 'custom', '--data', 'answers.json', '--dry-run', '--json'], { cwd: f.cwd }).catch(error => error)
    expect(error.code).toBe(1)
    expect(error.stdout + error.stderr).not.toContain('secret-value-734')
    expect(JSON.parse(error.stdout).error).toMatch(/parameter/iu)
    expect(await contents(f.cwd)).toEqual(before)
  }
})
