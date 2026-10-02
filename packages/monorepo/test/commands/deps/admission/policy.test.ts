import { writeFile } from 'node:fs/promises'
import { checkDependencyAdmission } from '@icebreakers/monorepo'
import path from 'pathe'
import { describe, expect, it } from 'vitest'
import { fixture, rule, snapshot } from './fixture'

describe('built third-party dependency admission', () => {
  it('scopes rules to workspace names and declaration fields, keeping root and private packages visible', async () => {
    const h = await fixture({
      '.': { dependencies: { 'legacy-sdk': '^1' } },
      'packages/web': { name: '@test/web', dependencies: { 'legacy-sdk': '^1' }, devDependencies: { 'legacy-sdk': '^1' } },
      'packages/server': { dependencies: { 'legacy-sdk': '^1' } },
    })
    const before = await snapshot(h.root)
    const result = await checkDependencyAdmission(h.workspace, { config: { rules: [rule({ workspaces: ['@test/web'] })] } })
    expect(result.declarations).toHaveLength(4)
    expect(result.findings).toMatchObject([{ id: 'admission-denied', rule: 'browser', reason: 'Use the maintained SDK', alternative: 'modern-sdk', declaration: { workspace: 'packages/web', path: 'packages/web/package.json', section: 'dependencies', name: 'legacy-sdk' } }])
    expect(result.summary).toEqual({ fail: 1, warn: 0, existing: 0, waived: 0 })
    expect(await snapshot(h.root)).toEqual(before)
  })

  it('matches npm alias targets and scope rules in optional and peer declarations', async () => {
    const h = await fixture({ 'packages/web': { optionalDependencies: { safe: 'npm:@old/sdk@latest' }, peerDependencies: { other: 'npm:@old/ui@^2' }, devDependencies: { tool: 'npm:@old/tool' } } })
    const result = await checkDependencyAdmission(h.workspace, { config: { rules: [rule({ dependencies: ['@old/*'], sections: ['optionalDependencies', 'peerDependencies', 'devDependencies'] })] } })
    expect(result.findings.map(item => item.declaration?.target).sort()).toEqual(['@old/sdk', '@old/tool', '@old/ui'])
    expect(result.summary.fail).toBe(3)
    const named = await checkDependencyAdmission(h.workspace, { config: { rules: [rule({ dependencies: ['safe'], sections: ['optionalDependencies'] })] } })
    expect(named.summary.fail).toBe(1)
  })

  it('unions allowlists, checks the alias target and rejects explicit allow/deny conflicts', async () => {
    const h = await fixture({ 'packages/web': { dependencies: { react: '^19', vue: '^3', alias: 'npm:forbidden@^1' } } })
    const rules = [rule({ id: 'react', effect: 'allow', dependencies: ['react', 'alias'] }), rule({ id: 'vue', effect: 'allow', dependencies: ['vue'] })]
    const result = await checkDependencyAdmission(h.workspace, { config: { rules } })
    expect(result.findings).toHaveLength(2)
    expect(result.findings.every(item => item.declaration?.target === 'forbidden')).toBe(true)
    const conflict = await checkDependencyAdmission(h.workspace, { config: { rules: [...rules, rule({ id: 'no-react', dependencies: ['react'] })] } })
    expect(conflict.findings.find(item => item.id === 'admission-conflict')).toMatchObject({ rule: 'no-react, react', status: 'fail', declaration: { name: 'react' } })
  })

  it('resolves default and named catalogs, reports missing targets and does not leak URL credentials', async () => {
    const h = await fixture({ 'packages/web': { dependencies: { a: 'catalog:', b: 'catalog:ui', c: 'catalog:default', missing: 'catalog:ui', archive: 'https://alice:secret@example.invalid/pkg.tgz' } } })
    await writeFile(path.join(h.workspace, 'pnpm-workspace.yaml'), 'packages: [packages/*]\ncatalog:\n  a: npm:legacy-sdk@1\n  c: npm:legacy-sdk@2\ncatalogs:\n  ui:\n    b: npm:legacy-sdk@latest\n')
    const result = await checkDependencyAdmission(h.workspace, { config: { rules: [rule({ dependencies: ['legacy-sdk', 'archive'] })] } })
    expect(result.summary.fail).toBe(5)
    expect(result.findings.filter(item => item.id === 'admission-denied')).toHaveLength(4)
    expect(result.findings.find(item => item.id === 'admission-resolution')?.declaration?.name).toBe('missing')
    expect(JSON.stringify(result)).not.toMatch(/alice|secret|example\.invalid/u)
  })

  it('skips explicit internal relationships but rejects ambiguous local semver candidates', async () => {
    const h = await fixture({
      'packages/internal': { name: '@test/internal', version: '1.0.0' },
      'packages/web': { dependencies: { 'internal': 'workspace:@test/internal@*', 'local': 'link:../internal', '@test/internal': '^1' } },
    })
    const result = await checkDependencyAdmission(h.workspace, { config: { rules: [rule({ effect: 'allow', dependencies: ['react'] })] } })
    expect(result.skipped.map(item => item.name)).toEqual(['internal', 'local'])
    expect(result.findings).toMatchObject([{ id: 'admission-resolution', declaration: { name: '@test/internal' } }])
    expect(result.summary.fail).toBe(1)
  })

  it('ignores unselected sections and reports unmatched selectors without silently expanding them', async () => {
    const h = await fixture({ 'packages/web': { devDependencies: { missing: 'catalog:missing' } } })
    const result = await checkDependencyAdmission(h.workspace, { config: { rules: [rule({ workspaces: ['packages/web', 'apps/missing'] })] } })
    expect(result.findings).toMatchObject([{ id: 'admission-selector-unmatched', status: 'warn' }])
    expect(result.summary.fail).toBe(0)
  })
})
