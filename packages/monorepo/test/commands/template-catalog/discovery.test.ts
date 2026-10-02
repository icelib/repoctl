import { mkdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { cli, fixture, loadRepo, snapshot, template } from './fixtures'

let repo: Awaited<ReturnType<typeof loadRepo>>
// Cold imports include the delivered dependency graph and coverage instrumentation.
beforeAll(async () => {
  repo = await loadRepo()
}, 30_000)

describe('built template catalog discovery', () => {
  it('keeps built-in definitions and literal compatibility helpers aligned', async () => {
    const cwd = await fixture()
    const catalog = await repo.resolveTemplateCatalog({ cwd })
    expect(catalog.entries).toHaveLength(8)
    expect(catalog.diagnostics).toEqual([])
    for (const entry of catalog.entries) {
      expect(entry.origin).toBe('builtin')
      expect(repo.getTemplateMap()[entry.key]).toEqual({ source: entry.source, target: entry.target })
      expect(catalog.choices.find(choice => choice.value === entry.key)).toMatchObject({ name: entry.label, description: entry.description })
    }
    expect((await repo.checkTemplates({ cwd })).summary.fail).toBe(0)
  })

  it('shares custom metadata across listing, detail, choices and creation from a nested directory', async () => {
    const cwd = await fixture({
      templatesDir: './team/templates',
      templateMap: { internal: { source: 'service', target: 'apps/internal', category: 'service', label: 'Internal API', description: 'Team service' } },
      choices: [{ value: 'internal', name: 'Company API', description: 'Company service', short: 'API' }],
    })
    const sourceDir = await template(cwd, 'team/templates/service')
    const nested = path.join(cwd, 'packages/existing')
    await mkdir(nested, { recursive: true })
    const before = await snapshot(cwd)
    const catalog = await repo.resolveTemplateCatalog({ cwd: nested })
    const entry = catalog.entries.find(item => item.key === 'internal')!
    expect(entry).toMatchObject({ key: 'internal', origin: 'custom', source: 'service', sourceDir: sourceDir.replaceAll('\\', '/'), label: 'Company API', category: 'service', description: 'Company service' })
    expect(catalog.choices).toEqual([{ value: 'internal', name: entry.label, description: entry.description, short: 'API' }])
    const listed = await cli(nested, ['templates', '--json'])
    const detail = await cli(nested, ['templates', 'internal', '--json'])
    const preview = await cli(nested, ['new', 'example', '--template', 'internal', '--json'])
    expect([listed.exitCode, detail.exitCode, preview.exitCode]).toEqual([0, 0, 0])
    expect(JSON.parse(listed.stdout).find((item: { key: string }) => item.key === 'internal')).toEqual(entry)
    expect(JSON.parse(detail.stdout)).toEqual(entry)
    expect(JSON.parse(preview.stdout)).toMatchObject({ sourceDir: entry.sourceDir, templateInfo: entry })
    for (const output of [await cli(nested, ['templates']), await cli(nested, ['templates', '--markdown'])]) {
      expect(output.exitCode).toBe(0)
      expect(output.stdout).toContain(entry.sourceDir)
      expect(output.stdout).toContain('custom')
      expect(output.stdout).toContain(entry.description)
    }
    expect(await snapshot(cwd)).toEqual(before)
    await repo.createNewProject({ cwd, type: 'internal', name: 'apps/example' })
    expect(await readFile(path.join(cwd, 'apps/example/index.mjs'), 'utf8')).toContain('custom = true')
    expect(JSON.parse(await readFile(path.join(cwd, 'apps/example/package.json'), 'utf8')).name).toBe('example')
    await expect(repo.createNewProject({ cwd, type: 'internal', name: 'apps/example' })).rejects.toThrow('already exists')
  })

  it('retains string template mappings and reports built-in overrides', async () => {
    const cwd = await fixture({ templatesDir: './team', templateMap: { legacy: 'legacy', tsdown: { source: 'replacement', target: 'packages/replaced' } } })
    await template(cwd, 'team/legacy')
    await template(cwd, 'team/replacement', 'export const replaced = true\n')
    const catalog = await repo.resolveTemplateCatalog({ cwd })
    expect(catalog.entries.find(entry => entry.key === 'legacy')).toMatchObject({ source: 'legacy', target: 'legacy', origin: 'custom' })
    expect(catalog.entries.find(entry => entry.key === 'tsdown')).toMatchObject({ source: 'replacement', origin: 'custom', overridesBuiltin: true })
    expect(catalog.diagnostics).toEqual([expect.objectContaining({ id: 'template-override', status: 'warn', template: 'tsdown', configFile: expect.stringContaining('repoctl.config.mjs'), configPath: 'commands.create.templateMap["tsdown"]' })])
    const detail = await cli(cwd, ['templates', 'tsdown', '--markdown'])
    expect(detail.stdout).toContain('| Overrides built-in | true |')
    await repo.createNewProject({ cwd, type: 'tsdown' })
    expect(await readFile(path.join(cwd, 'packages/replaced/index.mjs'), 'utf8')).toContain('replaced = true')
  })

  it('can mix installed templates with an absolute custom source', async () => {
    const cwd = await fixture()
    const source = await template(cwd, 'company/service')
    const other = await fixture({ templateMap: { company: { source, target: 'apps/company', category: 'service', description: 'Internal service' } } })
    const report = await repo.checkTemplates({ cwd: other })
    expect(report.templateCount).toBe(9)
    expect(report.summary.fail).toBe(0)
    const filtered = await cli(other, ['templates', '--category', 'service', '--json'])
    expect(JSON.parse(filtered.stdout).map((entry: { key: string }) => entry.key)).toEqual(['hono-server', 'company'])
  })
})
