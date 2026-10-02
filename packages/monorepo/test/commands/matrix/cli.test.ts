import type { AffectedCheckMatrix } from 'repoctl'
import { readFile, rm } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { sync as spawnSync } from 'cross-spawn'
import { afterEach, describe, expect, it } from 'vitest'
import { addPackage, cli, commit, fixture, git, readExecutions, stages, write } from '../affected/fixture'

const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})
async function setup() {
  const result = await fixture()
  roots.push(result.root)
  return result
}
function execute(job: AffectedCheckMatrix['matrix']['include'][number], cwd: string, log: string) {
  for (const command of job.commands) {
    if (command.skipReason) {
      continue
    }
    const result = spawnSync(command.executable, command.args, { cwd, encoding: 'utf8', env: { ...process.env, REPOCTL_AFFECTED_LOG: log } })
    expect(result.status, result.error?.message ?? `${result.stdout}\n${result.stderr}`).toBe(0)
  }
}

describe('built matrix CLI', () => {
  it('emits JSON without execution or writes, and honors explicit file output and redaction', async () => {
    const { cwd, base, log } = await setup()
    await write(cwd, 'apps/isolated/src/index.ts')
    const before = git(cwd, 'status', '--porcelain')
    const args = ['--affected', '--base', base, '--matrix']
    const output = JSON.parse(cli(cwd, args, log)) as AffectedCheckMatrix
    expect(output.hasWork).toBe(true)
    expect(output.matrix.include[0]?.packages).toEqual(['apps/isolated'])
    expect(git(cwd, 'status', '--porcelain')).toBe(before)
    await expect(readFile(log)).rejects.toThrow()
    cli(cwd, [...args, '--out', 'reports/matrix.json'], log)
    expect(JSON.parse(await readFile(`${cwd}/reports/matrix.json`, 'utf8'))).toEqual(output)
    const redacted = JSON.parse(cli(cwd, [...args, '--redact'])) as AffectedCheckMatrix
    expect(redacted.affectedPlan.cwd).toBe('<cwd>')
    expect(redacted.matrix).toEqual(output.matrix)
    await expect(readFile(log)).rejects.toThrow()
  })

  it('runs every job in its own clean checkout with its consumer build dependencies', async () => {
    const { root, cwd } = await setup()
    await write(cwd, 'record.cjs', `${await readFile(`${cwd}/record.cjs`, 'utf8')}\nif (task === 'test' && name === '@fixture/web' && ['base','shared'].some(id => !fs.existsSync(path.resolve('../../packages', id, '.built')))) process.exit(74);\n`)
    const base = commit(cwd)
    await write(cwd, 'packages/base/src/index.ts')
    commit(cwd)
    const output = JSON.parse(cli(cwd, ['--affected', '--base', base, '--matrix'])) as AffectedCheckMatrix
    for (const job of output.matrix.include) {
      const checkout = path.join(root, job.id)
      git(root, 'clone', cwd, checkout)
      const log = path.join(root, `${job.id}.jsonl`)
      execute(job, checkout, log)
      expect((await readExecutions(log)).filter(([, task]) => task === 'test')).toHaveLength(job.packages.length)
    }
    await expect(readFile(`${cwd}/packages/base/.built`)).rejects.toThrow()
  })

  it('passes literal directory names as arguments without evaluating shell syntax', async () => {
    const { cwd, log } = await setup()
    const directory = 'packages/job $(touch MATRIX_PWNED) [1]'
    await addPackage(cwd, directory, '@fixture/literal')
    await addPackage(cwd, 'packages/job $(touch MATRIX_PWNED) 1', '@fixture/decoy')
    const base = commit(cwd)
    await write(cwd, `${directory}/src/index.ts`)
    const output = JSON.parse(cli(cwd, ['--affected', '--base', base, '--matrix'])) as AffectedCheckMatrix
    expect(output.matrix.include).toHaveLength(1)
    execute(output.matrix.include[0]!, cwd, log)
    expect(await readExecutions(log)).toEqual(stages.map(task => ['@fixture/literal', task]))
    await expect(readFile(`${cwd}/MATRIX_PWNED`)).rejects.toThrow()
  })

  it('rejects incompatible options before executing scripts or writing output', async () => {
    const { cwd, log } = await setup()
    for (const args of [
      ['--matrix'],
      ['--affected', '--shards', '2'],
      ['--affected', '--matrix', '--shards', '0'],
      ['--affected', '--matrix', '--markdown'],
      ['--affected', '--matrix', '--report', 'bad.json'],
    ]) {
      expect(() => cli(cwd, [...args, '--out', 'reports/bad.json'], log)).toThrow()
    }
    await expect(readFile(`${cwd}/reports/bad.json`)).rejects.toThrow()
    await expect(readFile(log)).rejects.toThrow()
  })
})
