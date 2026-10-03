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

it('delivers JSON, Markdown, strict exits and report output through the built CLI', async (t) => {
  const f = await fixture(t)
  const args = [cli, 'templates', 'drift', '--source-dir', f.sourceDir]
  const before = await contents(f.cwd)
  const clean = await run(process.execPath, [...args, '--json', '--strict'], { cwd: f.cwd })
  expect(JSON.parse(clean.stdout).owners[0].local).toBe('unchanged')
  expect(await contents(f.cwd)).toEqual(before)
  await write(f.targetDir, 'README.md', 'Business docs')
  const normal = await run(process.execPath, [...args, '--json'], { cwd: f.cwd })
  expect(JSON.parse(normal.stdout).summary.warn).toBe(1)
  await expect(run(process.execPath, [...args, '--json', '--strict'], { cwd: f.cwd })).rejects.toMatchObject({ code: 1 })
  const output = path.join(f.root, 'report.md')
  await run(process.execPath, [...args, '--markdown', '--out', output], { cwd: f.cwd })
  expect(await fs.readFile(output, 'utf8')).toContain('| template-instance-drift | packages/legacy/README.md | warn | modified |')
})
