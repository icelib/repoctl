import { Buffer } from 'node:buffer'
import { link, rename, symlink, writeFile } from 'node:fs/promises'
import process from 'node:process'
import { applyDoctorFixPlan, planDoctorFix } from '@icebreakers/monorepo'
import path from 'pathe'
import { describe, expect, it } from 'vitest'
import fs from '@/utils/fs'
import { cli, contents, fixture } from './fixture'

describe('built doctor safe script repair', () => {
  it('previews exact additions, retains custom scripts and workflow, verifies, and reapplies without writes', async () => {
    const h = await fixture({ scripts: { 'repo:init': 'custom init', 'repo:check': '', 'release': 'custom-release' } })
    await fs.outputFile(path.join(h.root, '.github/workflows/release.yml'), 'name: custom\njobs: {}\n')
    const before = await contents(h.root)
    const plan = await planDoctorFix(h.cwd, { rules: ['root-scripts'] })
    expect(await contents(h.root)).toEqual(before)
    expect(plan.operations[0]).toMatchObject({ id: 'add-missing-root-scripts', path: 'package.json', risk: 'low', additions: [{ name: 'repo:new', command: 'repo new' }, { name: 'repo:doctor', command: 'repo doctor' }] })
    expect(plan.operations[0]?.diff).toContain('+++ b/package.json')
    const result = await applyDoctorFixPlan(h.cwd, JSON.parse(JSON.stringify(plan)))
    expect(result).toMatchObject({ status: 'applied', changed: ['package.json'], verification: { checks: [{ id: 'root-scripts', status: 'warn' }] } })
    const after = await contents(h.root)
    const original = JSON.parse(before['package.json']!)
    expect(JSON.parse(after['package.json']!)).toEqual({ ...original, scripts: { ...original.scripts, 'repo:new': 'repo new', 'repo:doctor': 'repo doctor' } })
    delete before['package.json']
    expect(Object.fromEntries(Object.entries(after).filter(([name]) => name !== 'package.json'))).toEqual(before)
    expect(await applyDoctorFixPlan(h.cwd, plan)).toMatchObject({ status: 'unchanged', changed: [] })
    expect(await contents(h.root)).toEqual(after)
    expect((await planDoctorFix(h.cwd, { rules: ['root-scripts'] })).operations).toEqual([])
  })

  it('rejects stale or tampered plans without overwriting unrelated edits', async () => {
    const h = await fixture()
    const plan = await planDoctorFix(h.cwd, { rules: ['root-scripts'] })
    const original = await contents(h.root)
    const altered = structuredClone(plan)
    altered.operations[0]!.after += 'arbitrary edit'
    await expect(applyDoctorFixPlan(h.cwd, altered)).rejects.toThrow('modified')
    expect(await contents(h.root)).toEqual(original)
    await fs.writeFile(path.join(h.root, 'package.json'), `${original['package.json']}\n`)
    const current = await contents(h.root)
    await expect(applyDoctorFixPlan(h.cwd, plan)).rejects.toThrow('input changed')
    expect(await contents(h.root)).toEqual(current)
  })

  it('does not repair unselected or actively suppressed rules or replace malformed script objects', async () => {
    const h = await fixture({ scripts: 'custom format' })
    expect((await planDoctorFix(h.cwd, { rules: ['package-json'] })).operations).toEqual([])
    const suppressed = await planDoctorFix(h.cwd, { rules: ['root-scripts'], suppressions: [{ id: 'root-scripts', reason: 'Manual scripts' }] })
    expect(suppressed.operations).toEqual([])
    const invalid = await planDoctorFix(h.cwd, { rules: ['root-scripts'] })
    expect(invalid.operations).toEqual([])
    expect(invalid.notes.join(' ')).toContain('not an object')
  })

  it('round-trips CLI preview and apply from a child directory and preserves CRLF', async () => {
    const h = await fixture()
    const file = path.join(h.root, 'package.json')
    await fs.writeFile(file, (await fs.readFile(file, 'utf8')).replaceAll('\n', '\r\n'))
    const preview = cli(h.cwd, ['--rules', 'root-scripts', '--fix', '--out', 'plan.json'])
    expect(preview.status, preview.stderr).toBe(0)
    const result = cli(h.cwd, ['--apply', 'plan.json', '--json', '--strict'])
    expect(result.status, result.stderr).toBe(0)
    expect(JSON.parse(result.stdout)).toMatchObject({ status: 'applied', verification: { summary: { pass: 1, warn: 0, fail: 0 } } })
    expect((await fs.readFile(file, 'utf8')).replaceAll('\r\n', '')).not.toContain('\n')
  })

  it('retains a UTF-8 BOM and rejects invalid UTF-8 without altering bytes', async () => {
    const h = await fixture()
    const file = path.join(h.root, 'package.json')
    await fs.writeFile(file, `\uFEFF${await fs.readFile(file, 'utf8')}`)
    await applyDoctorFixPlan(h.cwd, await planDoctorFix(h.cwd, { rules: ['root-scripts'] }))
    expect((await fs.readFile(file, 'utf8')).startsWith('\uFEFF')).toBe(true)
    const invalid = Buffer.concat([Buffer.from('{"name":"'), Buffer.from([0xFF]), Buffer.from('","private":true}')])
    await writeFile(file, invalid)
    await expect(planDoctorFix(h.cwd, { rules: ['root-scripts'] })).rejects.toThrow('not valid UTF-8')
    expect(await fs.readFile(file)).toEqual(invalid)
  })

  it.skipIf(process.platform === 'win32')('rejects linked package files during preview and apply', async () => {
    const h = await fixture()
    const plan = await planDoctorFix(h.cwd, { rules: ['root-scripts'] })
    const file = path.join(h.root, 'package.json')
    const copy = path.join(h.root, 'saved.json')
    await rename(file, copy)
    await symlink(copy, file)
    await expect(applyDoctorFixPlan(h.cwd, plan)).rejects.toThrow('Linked')
    await expect(planDoctorFix(h.cwd, { rules: ['root-scripts'] })).rejects.toThrow('Linked')
    await fs.remove(file)
    await link(copy, file)
    await expect(applyDoctorFixPlan(h.cwd, plan)).rejects.toThrow('Linked')
  })
})
