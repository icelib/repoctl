import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { applyCatalogMigrationPlan, planCatalogMigration } from '@icebreakers/monorepo'
import { describe, expect, it } from 'vitest'
import { fixture, snapshot } from '../deps/fixture'

const selection = { dependency: 'dep', section: 'dependencies' as const }

describe('catalog migration configuration contracts', () => {
  it('evaluates a fresh imported configuration once and hashes the same policy used to select consumers', async () => {
    const h = await fixture({
      'packages/a': { dependencies: { dep: '^1' } },
      'packages/b': { dependencies: { dep: '^2' } },
    })
    const evaluations = `${h.root}/evaluations.txt`
    await writeFile(`${h.workspace}/repoctl.config.mjs`, `
import { appendFileSync } from 'node:fs'
import deps from './deps.mjs'
appendFileSync(${JSON.stringify(evaluations)}, 'loaded\\n')
export default { commands: { deps } }
`)
    const policy = `export default ${JSON.stringify({ groups: [{ name: 'selected', dependencies: ['dep'], workspaces: ['packages/b'], reason: 'Intentional version cohort' }] })}\n`
    await writeFile(`${h.workspace}/deps.mjs`, policy)
    const plan = await planCatalogMigration(`${h.workspace}/packages/a`, { ...selection, group: 'selected', catalog: 'selected' })
    expect(await readFile(evaluations, 'utf8')).toBe('loaded\n')
    expect(plan.selection.to).toBe('^2')
    expect(plan.consumers.map(item => item.workspace)).toEqual(['packages/b'])
    expect(plan.inputs).toContainEqual({ path: 'deps.mjs', hash: createHash('sha256').update(policy).digest('hex') })

    await writeFile(`${h.workspace}/deps.mjs`, `${policy}// changed policy input\n`)
    const before = await snapshot(h.workspace)
    await expect(applyCatalogMigrationPlan(h.workspace, plan)).rejects.toThrow('deps.mjs changed')
    expect(await readFile(evaluations, 'utf8')).toBe('loaded\nloaded\n')
    expect(await snapshot(h.workspace)).toEqual(before)
  })

  it('uses default dependency groups while rejecting malformed imported owned blocks before mutation', async () => {
    const h = await fixture({ 'packages/a': { dependencies: { dep: '^1' } } })
    await writeFile(`${h.workspace}/repoctl.config.mjs`, 'import config from "./policy.mjs"; export default config\n')
    await writeFile(`${h.workspace}/policy.mjs`, 'export default { commands: { deps: {} } }\n')
    const plan = await planCatalogMigration(h.workspace, selection)
    expect(plan.selection.to).toBe('^1')
    expect(plan.consumers.map(item => item.workspace)).toEqual(['packages/a'])

    await writeFile(`${h.workspace}/policy.mjs`, 'export default { commands: { deps: {} }, dependencyPolicy: null }\n')
    const before = await snapshot(h.root)
    await expect(applyCatalogMigrationPlan(h.workspace, plan)).rejects.toMatchObject({
      code: 'REPOCTL_CONFIG_INVALID',
      message: expect.not.stringContaining(h.workspace),
      diagnostics: [{ id: 'config.invalid-type', path: 'dependencyPolicy', actualType: 'null' }],
    })
    expect(await snapshot(h.root)).toEqual(before)
  })
})
