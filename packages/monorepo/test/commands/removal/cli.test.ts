import { access, readFile, writeFile } from 'node:fs/promises'
import path from 'pathe'
import { describe, expect, it } from 'vitest'
import { fixture, runCli, snapshot } from './fixture'

describe('workspace removal built CLI', () => {
  it('defaults to preview and applies only a reviewed saved JSON plan', async () => {
    const h = await fixture({ 'packages/old': {}, 'packages/keep': {} })
    const before = await snapshot(h.root)
    const preview = runCli(h, ['old', '--json'])
    expect(preview.status, preview.stderr).toBe(0)
    const plan = JSON.parse(preview.stdout)
    expect(plan.canApply).toBe(true)
    expect(await snapshot(h.root)).toEqual(before)
    const file = path.join(h.root, 'plan.json')
    await writeFile(file, preview.stdout)
    const applied = runCli(h, ['--apply', file, '--json'])
    expect(applied.status, applied.stderr).toBe(0)
    expect(JSON.parse(applied.stdout)).toMatchObject({ status: 'applied', removed: ['packages/old'] })
    await expect(access(path.join(h.workspace, 'packages/old'))).rejects.toThrow()
    expect(await readFile(path.join(h.workspace, 'packages/keep/index.js'), 'utf8')).toContain('42')
  })

  it('reports consumers with nonzero preview status and rejects apply/preview flag combinations', async () => {
    const h = await fixture({ 'packages/old': {}, 'packages/keep': { dependencies: { old: 'workspace:*' } } })
    const blocked = runCli(h, ['old', '--dry-run', '--json'])
    expect(blocked.status).toBe(1)
    expect(JSON.parse(blocked.stdout).blockers[0].code).toBe('consumers')
    for (const args of [[], ['old', '--apply', 'plan.json'], ['--apply', 'plan.json', '--dry-run'], ['--apply', 'plan.json', '--remove-references']]) {
      expect(runCli(h, args).status).not.toBe(0)
    }
    expect(runCli(h, ['old', '--remove-references']).stdout).toContain('consumer: packages/keep → packages/old')
    await access(path.join(h.workspace, 'packages/old'))
  })
})
