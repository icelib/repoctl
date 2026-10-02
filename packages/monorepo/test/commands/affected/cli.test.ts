import { readFile, rm } from 'node:fs/promises'
import process from 'node:process'
import { resolveAffectedCheckPlan } from '@icebreakers/monorepo'
import { afterEach, describe, expect, it } from 'vitest'
import { addPackage, cli, commit, fixture, git, readExecutions, stages, write } from './fixture'

const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})
async function setup(...args: Parameters<typeof fixture>) {
  const result = await fixture(...args)
  roots.push(result.root)
  return result
}

describe('built affected CLI and execution reports', () => {
  it('previews without execution, then executes exactly the same targets and saves the same plan', async () => {
    const { cwd, base, log } = await setup()
    await write(cwd, 'packages/base/src/index.ts')
    const before = git(cwd, 'status', '--porcelain')
    const args = ['--affected', '--base', base, '--filter', '@fixture/web']
    const preview = JSON.parse(cli(cwd, [...args, '--json'], log))
    expect(preview).toEqual(await resolveAffectedCheckPlan({ cwd, base, filters: ['@fixture/web'] }))
    expect(git(cwd, 'status', '--porcelain')).toBe(before)
    await expect(readFile(log)).rejects.toThrow()
    expect(cli(cwd, [...args, '--dry-run'])).toContain('packages/base: filtered_out')
    cli(cwd, [...args, '--out', 'reports/plan.json'], log)
    await expect(readFile(log)).rejects.toThrow()
    cli(cwd, [...args, '--report', 'reports/result.json'], log)
    const report = JSON.parse(await readFile(`${cwd}/reports/result.json`, 'utf8'))
    expect(report.status).toBe('success')
    expect(report.affectedPlan).toEqual(preview)
    expect(await readExecutions(log)).toEqual([
      ['@fixture/base', 'build'],
      ['@fixture/shared', 'build'],
      ['@fixture/web', 'build'],
      ...stages.slice(1).map(task => ['@fixture/web', task]),
    ])
  })

  it('does no work for empty intersections and reports all skipped stages', async () => {
    const { cwd, base, log } = await setup()
    await write(cwd, 'packages/base/src/index.ts')
    cli(cwd, ['--affected', '--base', base, '--filter', '@fixture/isolated', '--report', 'reports/empty.json'], log)
    const report = JSON.parse(await readFile(`${cwd}/reports/empty.json`, 'utf8'))
    expect(report.tasks.every((task: { reason: string }) => task.reason === 'filter_intersection_empty')).toBe(true)
    await expect(readFile(log)).rejects.toThrow()
  })

  it('preserves pnpm failure status, skips later checks and keeps affected reasons in Markdown reports', async () => {
    const { cwd, log } = await setup()
    const manifest = JSON.parse(await readFile(`${cwd}/apps/web/package.json`, 'utf8'))
    manifest.scripts.lint = 'node -e "process.exit(7)"'
    await write(cwd, 'apps/web/package.json', JSON.stringify(manifest))
    const base = commit(cwd)
    await write(cwd, 'apps/web/src/index.ts')
    expect(() => cli(cwd, ['--affected', '--base', base, '--report', 'reports/failed.md', '--report-format', 'markdown'], log)).toThrow()
    const markdown = await readFile(`${cwd}/reports/failed.md`, 'utf8')
    expect(markdown).toContain('- Status: failed')
    expect(markdown).toContain('previous_task_failed')
    expect(markdown).toContain('direct_change')
  })

  it.each([
    ['literal[1]', 'literal1'],
    ['literal{1,2}', 'literal1'],
    ...process.platform === 'win32' ? [] : [['dots...', 'dots']],
  ])('preserves the literal directory %s when selecting pnpm packages', async (directory, other) => {
    const { cwd, log } = await setup()
    await addPackage(cwd, `packages/${directory}`, '@fixture/literal')
    await addPackage(cwd, `packages/${other}`, '@fixture/other')
    const base = commit(cwd)
    await write(cwd, `packages/${directory}/src/index.ts`)
    cli(cwd, ['--affected', '--base', base], log)
    expect(await readExecutions(log)).toEqual(stages.map(task => ['@fixture/literal', task]))
  })

  it('rejects conflicting mode/report options before executing any scripts', async () => {
    const { cwd, base, log } = await setup()
    for (const args of [
      ['--base', base],
      ['--affected', '--full'],
      ['--affected', '--staged'],
      ['--affected', '--edit-file', 'message'],
      ['--affected', '--json', '--report', 'bad.json'],
    ]) {
      expect(() => cli(cwd, args, log)).toThrow()
    }
    await expect(readFile(log)).rejects.toThrow()
  })
})
