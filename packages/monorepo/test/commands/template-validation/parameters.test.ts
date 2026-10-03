import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { cli, exists, fixture, json, loadRepo, trackRoot } from './fixtures'

let repo: Awaited<ReturnType<typeof loadRepo>>
beforeAll(async () => {
  repo = await loadRepo()
}, 30_000)

const parameters = {
  schemaVersion: 1,
  parameters: { enabled: { type: 'boolean', default: false }, secret: { type: 'string', sensitive: true, required: true } },
  interpolate: ['secret.json'],
  conditions: [{ when: { parameter: 'enabled', equals: true }, files: ['feature.js'] }],
}
const secret = 'validation-secret-"\\value'
async function parameterFixture(broken = false) {
  const options = await fixture({ files: {
    'repoctl.template.json': JSON.stringify(parameters),
    'secret.json': '{"token": {{repoctl-json:secret}}}',
    'feature.js': broken ? `export const optional = () => import('missing-conditional-runtime')` : 'export const feature = true',
  } })
  const tasks = path.join(options.sourceDir, 'tasks.mjs')
  await writeFile(tasks, `${await readFile(tasks, 'utf8')}
if (task === 'build' && existsSync('feature.js')) copyFileSync('feature.js', 'dist/feature.js')
console.log((await import('./secret.json', { with: {type: 'json'} })).default.token)
`)
  return options
}

describe('typed template validation matrix', () => {
  it('plans rendered file and script requirements for each parameter set', async () => {
    const options = await fixture({ files: {
      'optional.ts': 'export const typed = true',
      'repoctl.template.json': JSON.stringify({
        schemaVersion: 1,
        parameters: { typed: { type: 'boolean' } },
        conditions: [{ when: { parameter: 'typed', equals: true }, files: ['optional.ts'], package: { scripts: { typecheck: 'tsc --noEmit', tsd: 'tsd' } } }],
      }),
    } })
    const plan = await repo.planTemplateValidation({ ...options, parameterSets: [{ typed: false }, { typed: true }] })
    expect(plan.diagnostics).toEqual([])
    expect(plan.scripts).toEqual(['build', 'lint', 'typecheck', 'tsd', 'test'])
    expect(plan.parameterSets.map(set => set.scripts)).toEqual([
      ['build', 'lint', 'test'],
      ['build', 'lint', 'typecheck', 'tsd', 'test'],
    ])
    const manifest = await json(path.join(options.sourceDir, 'repoctl.template.json'))
    delete manifest.conditions[0].package
    await writeFile(path.join(options.sourceDir, 'repoctl.template.json'), JSON.stringify(manifest))
    const invalid = await repo.planTemplateValidation({ ...options, parameterSets: [{ typed: false }, { typed: true }] })
    expect(invalid.diagnostics.map(item => [item.parameterSet, item.message])).toEqual([
      [1, 'Missing required script: typecheck'],
      [1, 'Missing required script: tsd'],
    ])
  })

  it('crosses names and parameters, hides child output and retains only redacted reports', async () => {
    const options = await parameterFixture()
    const parameterSets = [{ enabled: false, secret }, { enabled: true, secret }]
    const plan = await repo.planTemplateValidation({ ...options, parameterSets })
    expect(JSON.stringify(plan)).not.toContain('validation-secret')
    const report = await repo.validateTemplate({ ...options, parameterSets, names: ['first', 'second'], keep: 'always' })
    trackRoot(report.temporaryDirectory!)
    expect(report.status, JSON.stringify(report)).toBe('passed')
    expect(report.samples.map(sample => [sample.name, sample.parameterSet])).toEqual([['first', 0], ['first', 1], ['second', 0], ['second', 1]])
    for (const sample of report.samples) {
      const target = path.join(sample.directory, 'packages', sample.name)
      expect(await exists(path.join(target, 'feature.js'))).toBe(sample.parameterSet === 1)
      expect(await json(path.join(target, 'secret.json'))).toEqual({ token: secret })
      expect(sample.parameters['secret']).toBe('[redacted]')
      expect(sample.steps.find(step => step.stage === 'build')?.command?.output).toContain('redacted')
    }
    expect(JSON.stringify(report)).not.toContain('validation-secret')
    expect(await readFile(path.join(report.temporaryDirectory!, 'report.json'), 'utf8')).not.toContain('validation-secret')
    expect(await exists(path.join(options.sourceDir, 'execution.txt'))).toBe(false)
  }, 120_000)

  it('fails a real conditional dependency omission only in the enabled combination', async () => {
    const options = await parameterFixture(true)
    const report = await repo.validateTemplate({ ...options, parameterSets: [{ enabled: false, secret }, { enabled: true, secret }] })
    expect(report.samples.map(sample => sample.status)).toEqual(['passed', 'failed'])
    expect(report.samples[1]?.failedStage).toBe('artifact')
    expect(report.samples[1]?.artifact?.packages.flatMap(pkg => pkg.diagnostics)).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'UNDECLARED_RUNTIME_DEPENDENCY' })]))
    expect(JSON.stringify(report)).not.toContain('validation-secret')
    expect(report.retained).toBe(false)
  }, 90_000)

  it('accepts a JSON matrix file in CLI, without disclosing secrets in stdout or --out', async () => {
    const options = await parameterFixture()
    const matrix = path.join(options.cwd, 'matrix.json')
    const output = path.join(options.cwd, 'report.json')
    await writeFile(matrix, JSON.stringify([{ enabled: false, secret }, { enabled: true, secret }]))
    const result = await cli(options.cwd, ['templates', 'validate', 'custom', '--fixture', options.fixtureDir, '--parameter-matrix', matrix, '--json', '--out', output])
    expect(result.exitCode, result.all).toBe(0)
    expect(JSON.parse(result.stdout).samples).toHaveLength(2)
    expect(result.stdout + result.stderr + await readFile(output, 'utf8')).not.toContain('validation-secret')
    await writeFile(matrix, '[{"secret":"validation-secret-bad-json')
    const malformed = await cli(options.cwd, ['templates', 'validate', 'custom', '--fixture', options.fixtureDir, '--parameter-matrix', matrix, '--dry-run'])
    expect(malformed.exitCode).toBe(1)
    expect(malformed.stdout + malformed.stderr).not.toContain('validation-secret')
  }, 90_000)

  it('preserves protocol enums when sensitive values match status or stage words', async () => {
    const options = await parameterFixture()
    const report = await repo.validateTemplate({ ...options, parameterSets: ['passed', 'failed', 'generate'].map(secret => ({ enabled: false, secret })) })
    expect(report.status, JSON.stringify(report)).toBe('passed')
    for (const sample of report.samples) {
      expect(sample.status).toBe('passed')
      expect(sample.steps[0]?.stage).toBe('generate')
      expect(sample.steps.every(step => step.status === 'passed')).toBe(true)
      expect(sample.parameters['secret']).toBe('[redacted]')
      expect(sample.steps.find(step => step.stage === 'build')?.command?.output).toBe('[redacted: sensitive template parameters]')
    }
  }, 90_000)

  it('rejects unknown or wrongly typed parameters and oversized name products before execution', async () => {
    const options = await parameterFixture()
    for (const parameterSets of [[{ enabled: 'true', secret }], [{ unknown: true, secret }], []]) {
      await expect(repo.validateTemplate({ ...options, parameterSets })).rejects.toThrow()
    }
    await expect(repo.validateTemplate({ ...options, names: ['one', 'two'], parameterSets: Array.from({ length: 11 }, () => ({ enabled: true, secret })) })).rejects.toThrow('20 total samples')
    expect(await exists(path.join(options.sourceDir, 'execution.txt'))).toBe(false)
  })
})
