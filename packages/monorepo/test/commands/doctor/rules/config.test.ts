import { applyDoctorFixPlan, planDoctorFix, runDoctor } from '@icebreakers/monorepo'
import path from 'pathe'
import { describe, expect, it } from 'vitest'
import fs from '@/utils/fs'
import { contents, fixture } from './fixture'

describe('built doctor configuration lifecycle', () => {
  it('refreshes imported rules and suppression reasons on every call without writing a config cache', async () => {
    const h = await fixture()
    await fs.writeFile(path.join(h.root, 'repoctl.config.ts'), 'import doctor from "./doctor-policy.ts"; export default {commands:{doctor}}')
    const policy = path.join(h.root, 'doctor-policy.ts')
    await fs.writeFile(policy, 'export default {rules:["root-scripts"],suppressions:[{id:"root-scripts",reason:"Migration"}]}')
    const before = await contents(h.root)
    expect((await runDoctor(h.cwd)).checks).toMatchObject([{ id: 'root-scripts', suppression: { reason: 'Migration' } }])
    expect(await contents(h.root)).toEqual(before)
    await fs.writeFile(policy, 'export default {rules:["root-scripts"],suppressions:[]}')
    expect((await runDoctor(h.cwd)).summary.warn).toBe(1)
    await fs.writeFile(policy, 'export default {rules:["package-json"]}')
    expect((await runDoctor(h.cwd)).checks.map(check => check.id)).toEqual(['package-json'])
  })

  it.each(['null', '{rules:null}', '{suppressions:null}', '{suppressions:[{id:"root-scripts",reason:null}]}'])('rejects a malformed raw doctor policy %s', async (doctor) => {
    const h = await fixture()
    await fs.writeFile(path.join(h.root, 'repoctl.config.mjs'), `export default {commands:{doctor:${doctor}}}`)
    await expect(runDoctor(h.cwd)).rejects.toThrow('cannot be null')
  })

  it('restores the manifest if fresh configuration prevents post-apply verification', async () => {
    const h = await fixture()
    const plan = await planDoctorFix(h.cwd, { rules: ['root-scripts'] })
    const before = await fs.readFile(path.join(h.root, 'package.json'), 'utf8')
    await fs.writeFile(path.join(h.root, 'repoctl.config.mjs'), 'throw new Error("verification blocked")')
    await expect(applyDoctorFixPlan(h.cwd, plan)).rejects.toThrow('verification blocked')
    expect(await fs.readFile(path.join(h.root, 'package.json'), 'utf8')).toBe(before)
  })

  it('preserves a concurrent edit and reports blocked rollback after verification fails', async () => {
    const h = await fixture()
    const plan = await planDoctorFix(h.cwd, { rules: ['root-scripts'] })
    await fs.writeFile(path.join(h.root, 'repoctl.config.mjs'), `
      import { readFileSync, writeFileSync } from 'node:fs'
      const file = new URL('./package.json', import.meta.url)
      const manifest = JSON.parse(readFileSync(file, 'utf8'))
      manifest.concurrent = true
      writeFileSync(file, JSON.stringify(manifest))
      throw new Error('verification blocked after concurrent edit')
    `)
    await expect(applyDoctorFixPlan(h.cwd, plan)).rejects.toThrow('rollback was blocked')
    expect(await fs.readJson(path.join(h.root, 'package.json'))).toMatchObject({ concurrent: true, scripts: { 'repo:doctor': 'repo doctor' } })
    const backups = (await fs.readdir(h.root)).filter(name => name.endsWith('.bak'))
    expect(backups).toHaveLength(1)
    expect(await fs.readFile(path.join(h.root, backups[0]!), 'utf8')).toBe(plan.operations[0]!.before)
  })
})
