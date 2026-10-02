import { mkdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { cli, fixture, loadRepo, snapshot, template } from './fixtures'

let repo: Awaited<ReturnType<typeof loadRepo>>
// Cold imports include the delivered dependency graph and coverage instrumentation.
beforeAll(async () => {
  repo = await loadRepo()
}, 30_000)

describe('built template catalog health', () => {
  it('checks a mixed template root without executing template code or writing files', async () => {
    const cwd = await fixture({ templatesDir: './team', templateMap: { company: { source: 'company', target: 'apps/company', category: 'app', description: 'Company app' } } })
    const catalog = await repo.resolveTemplateCatalog({ cwd })
    for (const entry of catalog.entries) {
      await template(cwd, `team/${entry.source}`, `throw new Error('template code must not execute during discovery')\n`)
    }
    const before = await snapshot(cwd)
    const report = await repo.checkTemplates({ cwd })
    expect(report.summary).toEqual({ pass: 42, warn: 0, fail: 0 })
    expect(report.templates).toEqual(catalog.entries)
    const checked = await cli(cwd, ['templates', '--check', '--json'])
    expect(checked.exitCode).toBe(0)
    expect(JSON.parse(checked.stdout)).toEqual(report)
    expect(await snapshot(cwd)).toEqual(before)
  })

  it('locates missing sources and missing manifests in the declaring config', async () => {
    const cwd = await fixture({ templatesDir: './team', templateMap: { absent: 'absent', incomplete: 'incomplete', plain: 'plain' } })
    await mkdir(path.join(cwd, 'team/incomplete'), { recursive: true })
    await writeFile(path.join(cwd, 'team/plain'), 'not a directory')
    const report = await repo.checkTemplates({ cwd })
    expect(report.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'source-dir', status: 'fail', template: 'absent', configFile: expect.stringContaining('repoctl.config.mjs'), configPath: 'commands.create.templateMap["absent"]' }),
      expect.objectContaining({ id: 'package-json', status: 'fail', template: 'incomplete' }),
      expect.objectContaining({ id: 'source-dir', status: 'fail', template: 'plain' }),
    ]))
    expect((await cli(cwd, ['templates', '--check', '--json'])).exitCode).toBe(1)
  })

  it('reports duplicate sources, destinations and interactive keys', async () => {
    const cwd = await fixture({ templateMap: { first: { source: 'same', target: 'apps/same' }, second: { source: 'same', target: 'apps/same' } }, choices: [{ value: 'first' }, { value: 'first' }, { value: 'missing' }] })
    const report = await repo.checkTemplates({ cwd })
    expect(report.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'unique-source', status: 'fail', detail: expect.stringContaining('first, second') }),
      expect.objectContaining({ id: 'unique-target', status: 'fail' }),
      expect.objectContaining({ id: 'template-choice', status: 'fail', configPath: 'commands.create.choices[1]' }),
      expect.objectContaining({ id: 'template-choice', status: 'fail', configPath: 'commands.create.choices[2]' }),
    ]))
    expect((await repo.resolveTemplateCatalog({ cwd })).choices.map(choice => choice.value)).toEqual(['first'])
  })

  it.each([
    { templateMap: { broken: { source: 42, target: 'apps/broken' } } },
    { templateMap: { broken: null } },
    { templateMap: { broken: { source: 'broken', target: '', category: 'unknown' } } },
    { templateMap: [] },
    { templatesDir: null },
    { templatesDir: 42 },
    { choices: {} },
  ])('reports invalid configuration without writing: %j', async (create) => {
    const cwd = await fixture(create)
    const before = await snapshot(cwd)
    const report = await repo.checkTemplates({ cwd })
    expect(report.checks.some(check => check.status === 'fail' && check.configPath?.startsWith('commands.create.'))).toBe(true)
    expect(await snapshot(cwd)).toEqual(before)
  })

  it('does not fall back to a built-in when its override is invalid', async () => {
    const cwd = await fixture({ templateMap: { tsdown: { source: 42, target: 'packages/broken' } } })
    await expect(repo.resolveCreateNewProjectPlan({ cwd, type: 'tsdown' })).rejects.toThrow('commands.create.templateMap["tsdown"]')
    expect((await cli(cwd, ['templates', '--json'])).exitCode).toBe(1)
    const result = await cli(cwd, ['templates', 'tsdown', '--json'])
    expect(result.exitCode).toBe(1)
    expect(result.stderr).toContain('repoctl.config.mjs')
  })

  it('honors an explicit inspection root and detects filtered files', async () => {
    const cwd = await fixture()
    const alternate = path.join(cwd, 'alternate')
    const catalog = await repo.resolveTemplateCatalog({ cwd, templatesDir: 'alternate' })
    for (const entry of catalog.entries) {
      await template(cwd, `alternate/${entry.source}`)
    }
    await mkdir(path.join(alternate, 'tsdown/node_modules'), { recursive: true })
    await writeFile(path.join(alternate, 'tsdown/node_modules/generated.js'), 'temporary')
    const report = await repo.checkTemplates({ cwd, templatesDir: 'alternate' })
    expect(report.templatesDir).toBe(alternate.replaceAll('\\', '/'))
    expect(report.checks).toContainEqual(expect.objectContaining({ id: 'filtered-files', template: 'tsdown', status: 'fail' }))
    await rm(path.join(alternate, 'tsdown/node_modules'), { recursive: true })
  })
})
