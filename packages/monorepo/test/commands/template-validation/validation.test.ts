import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { cli, exists, fixture, json, loadRepo, trackRoot } from './fixtures'

let repo: Awaited<ReturnType<typeof loadRepo>>
beforeAll(async () => {
  repo = await loadRepo()
}, 30_000)

describe('delivered template author validation', () => {
  it('plans without generation and identifies every required script', async () => {
    const options = await fixture({ scripts: { build: '', lint: '', test: '' }, files: { 'index.ts': 'export const value = 1' } })
    const report = await repo.validateTemplate(options)
    expect(report.status).toBe('failed')
    expect(report.temporaryDirectory).toBeUndefined()
    expect(report.plan.diagnostics.map(item => item.message)).toEqual(['build', 'lint', 'typecheck', 'tsd', 'test'].map(script => `Missing required script: ${script}`))
    expect(await exists(path.join(options.sourceDir, 'execution.txt'))).toBe(false)
    const result = await cli(options.cwd, ['templates', 'validate', 'custom', '--fixture', options.fixtureDir, '--dry-run', '--json'])
    expect(result.exitCode).toBe(1)
    expect(JSON.parse(result.stdout)).toMatchObject({ template: 'custom', names: ['validation-sample'] })
  })

  it('executes isolated names in order, consumes tarballs, and leaves source untouched', async () => {
    const options = await fixture()
    const report = await repo.validateTemplate({ ...options, names: ['alpha', 'renamed-library'], keep: 'always' })
    if (report.temporaryDirectory) {
      trackRoot(report.temporaryDirectory)
    }
    expect(report.status, JSON.stringify(report)).toBe('passed')
    expect(report.samples.map(item => item.name)).toEqual(['alpha', 'renamed-library'])
    for (const sample of report.samples) {
      expect(sample.steps.map(step => step.stage)).toEqual(['generate', 'install', 'build', 'lint', 'test', 'artifact'])
      expect(await readFile(path.join(sample.directory, 'packages', sample.name, 'execution.txt'), 'utf8')).toBe('build\nlint\ntest\n')
      expect(sample.artifact?.packages[0]?.files).toContain('dist/index.js')
      expect(sample.artifact?.packages[0]?.commands.some(command => command.args.includes('--eval'))).toBe(true)
    }
    expect((await json(path.join(report.temporaryDirectory!, 'report.json'))).retained).toBe(true)
    expect(await exists(path.join(options.sourceDir, 'execution.txt'))).toBe(false)
    const { rm } = await import('node:fs/promises')
    await rm(report.temporaryDirectory!, { recursive: true, force: true })
  }, 90_000)

  it('builds workspace dependencies first and consumes their actual tarballs', async () => {
    const options = await fixture({ files: { 'index.js': `export { value } from 'fixture-util'` } })
    const manifestFile = path.join(options.sourceDir, 'package.json')
    await writeFile(manifestFile, JSON.stringify({ ...await json(manifestFile), dependencies: { 'fixture-util': 'workspace:*' } }))
    const companion = path.join(options.fixtureDir, 'packages/util')
    await mkdir(companion, { recursive: true })
    await writeFile(path.join(companion, 'package.json'), JSON.stringify({
      name: 'fixture-util',
      version: '1.0.0',
      private: true,
      type: 'module',
      license: 'MIT',
      files: ['dist'],
      exports: './dist/index.js',
      scripts: { build: 'node build.mjs' },
    }))
    await writeFile(path.join(companion, 'build.mjs'), `import { mkdirSync, writeFileSync } from 'node:fs'; mkdirSync('dist', {recursive: true}); writeFileSync('dist/index.js', 'export const value = 42')`)
    const report = await repo.validateTemplate(options)
    expect(report.status, JSON.stringify(report)).toBe('passed')
    expect(report.samples[0]?.artifact?.packages.map(item => [item.name, item.role, item.status])).toEqual([
      ['fixture-util', 'dependency', 'passed'],
      ['validation-sample', 'selected', 'passed'],
    ])
  }, 60_000)

  it('honors inherited JSON flags for a complete CLI validation', async () => {
    const options = await fixture({ category: 'tool' })
    const result = await cli(options.cwd, ['templates', '--json', 'validate', 'custom', '--fixture', options.fixtureDir])
    expect(result.exitCode).toBe(0)
    expect(JSON.parse(result.stdout)).toMatchObject({ status: 'passed', retained: false })
  }, 60_000)

  it('rejects source path leakage before running installation or scripts', async () => {
    const options = await fixture()
    await writeFile(path.join(options.sourceDir, 'leak.mjs'), `import '${options.sourceDir}/index.js'`)
    const report = await repo.validateTemplate(options)
    expect(report.samples[0]?.failedStage).toBe('generate')
    expect(report.samples[0]?.steps[0]?.diagnostics).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'SOURCE_PATH_LEAK' })]))
    expect(report.samples[0]?.steps.some(step => step.stage === 'install')).toBe(false)
    expect(await exists(path.join(report.temporaryDirectory!, 'sample-0/package.json'))).toBe(false)
  })

  it.each([
    { exports: { '.': './dist/missing.js' }, code: 'EXPORTS_TYPES_SHOULD_BE_FIRST' },
    { files: { 'index.js': `export const value = 42; export const optional = () => import('missing-template-runtime')` }, code: 'UNDECLARED_RUNTIME_DEPENDENCY' },
    { imports: { '#adapter': { node: 'missing-template-runtime', default: 'missing-template-fallback' } }, files: { 'index.js': `export const value = 42; export const optional = () => import('#adapter')` }, code: 'UNDECLARED_RUNTIME_DEPENDENCY' },
  ])('fails real packed defects %#', async (bad) => {
    const options = await fixture(bad)
    const report = await repo.validateTemplate(options)
    expect(report.status).toBe('failed')
    expect(report.samples[0]?.failedStage).toBe('artifact')
    expect(report.samples[0]?.artifact?.packages.flatMap(item => item.diagnostics).some(item => item.severity === 'error')).toBe(true)
    if (bad.files) {
      expect(report.samples[0]?.artifact?.packages.flatMap(item => item.diagnostics)).toEqual(expect.arrayContaining([expect.objectContaining({ code: bad.code })]))
    }
    expect(report.retained).toBe(false)
  }, 60_000)
})
