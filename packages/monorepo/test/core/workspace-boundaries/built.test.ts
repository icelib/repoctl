import type { WorkspaceBoundariesConfig } from '@icebreakers/monorepo'
import { spawnSync } from 'node:child_process'
import { rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { checkWorkspaceBoundaries, runDoctor } from '@icebreakers/monorepo'
import { afterEach, describe, expect, it } from 'vitest'
import { diamond, fingerprint, fixture } from '../workspace-graph/fixture'

const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map(cwd => rm(cwd, { force: true, recursive: true })))
})

async function setup(...args: Parameters<typeof fixture>) {
  const cwd = await fixture(...args)
  roots.push(cwd)
  return cwd
}

const cycle = {
  'packages/a': { name: 'a', dependencies: { b: 'workspace:*', c: 'workspace:*' } },
  'packages/b': { name: 'b', dependencies: { c: 'workspace:*' } },
  'packages/c': { name: 'c', dependencies: { a: 'workspace:*' } },
}

describe('built internal workspace boundary policies', () => {
  it('accepts a layered graph, includes root/private and defaults to runtime cycles only', async () => {
    const cwd = await setup(diamond)
    const before = await fingerprint(cwd)
    const result = await checkWorkspaceBoundaries(cwd, { config: {
      tags: { shared: { paths: ['packages/**'] }, apps: { paths: ['apps/**'] } },
      rules: [{ id: 'apps-use-shared', from: { tags: ['apps'] }, allow: [{ tags: ['shared'] }] }],
    } })
    expect(result.packageCount).toBe(7)
    expect(result.summary).toEqual({ fail: 0, warn: 0, waived: 0 })
    expect(await fingerprint(cwd)).toEqual(before)
    const dev = await checkWorkspaceBoundaries(cwd, { config: { cycles: { dependencyTypes: ['dependencies', 'devDependencies'], severity: 'warn' } } })
    expect(dev.findings).toMatchObject([{ id: 'boundary-cycle', status: 'warn', chain: ['packages/a', 'packages/base', 'packages/a'] }])
  })

  it('reports one stable representative for a multi-cycle component with manifest fields', async () => {
    const cwd = await setup(cycle)
    const result = await checkWorkspaceBoundaries(cwd)
    expect(result.findings).toHaveLength(1)
    expect(result.findings[0]).toMatchObject({ id: 'boundary-cycle', status: 'fail', members: ['packages/a', 'packages/b', 'packages/c'], chain: ['packages/a', 'packages/c', 'packages/a'], path: 'packages/a', field: 'dependencies.c' })
    expect(result.findings[0]!.edges!.every((edge, i) => edge.source === result.findings[0]!.chain![i] && edge.target === result.findings[0]!.chain![i + 1])).toBe(true)
    const reversed = await setup(Object.fromEntries(Object.entries(cycle).reverse()))
    expect((await checkWorkspaceBoundaries(reversed)).findings).toEqual(result.findings)
  })

  it('detects independent direct and self cycles while allowing explicit peer-only policy', async () => {
    const cwd = await setup({
      'packages/a': { name: 'a', dependencies: { a: 'workspace:*' } },
      'packages/b': { name: 'b', peerDependencies: { c: 'workspace:*' } },
      'packages/c': { name: 'c', peerDependencies: { b: 'workspace:*' } },
    })
    expect((await checkWorkspaceBoundaries(cwd)).findings).toMatchObject([{ chain: ['packages/a', 'packages/a'] }])
    const result = await checkWorkspaceBoundaries(cwd, { config: { cycles: { dependencyTypes: ['dependencies', 'peerDependencies'] } } })
    expect(result.findings.map(item => item.chain)).toEqual([['packages/a', 'packages/a'], ['packages/b', 'packages/c', 'packages/b']])
  })

  it('locates forbidden reverse edges and public-to-private edges independently', async () => {
    const cwd = await setup({
      'apps/web': { name: 'web', private: true },
      'packages/shared': { name: 'shared', dependencies: { web: 'workspace:*' } },
    }, { dependencies: { shared: 'workspace:*' } })
    const result = await checkWorkspaceBoundaries(cwd, { config: { rules: [
      { id: 'shared-down', from: { paths: ['packages/shared'] }, allow: [{ paths: ['packages/**'] }] },
      { id: 'public', from: { private: false }, allow: [{ private: false }] },
      { id: 'root', from: { paths: ['.'] }, allow: [] },
    ] } })
    expect(result.findings.map(item => item.rule)).toEqual(['shared-down', 'public', 'root'])
    expect(result.findings[0]).toMatchObject({ path: 'packages/shared', field: 'dependencies.web', chain: ['packages/shared', 'apps/web'] })
    expect(result.findings[2]?.chain).toEqual(['.', 'packages/shared'])
  })

  it('waives only the exact typed edge and retains other cycles in the component', async () => {
    const cwd = await setup(cycle)
    const config: WorkspaceBoundariesConfig = { exceptions: [{ rule: 'cycle', source: 'packages/a', target: 'packages/c', type: 'dependencies', reason: 'Temporary migration' }] }
    const result = await checkWorkspaceBoundaries(cwd, { config })
    expect(result.findings[0]?.chain).toEqual(['packages/a', 'packages/b', 'packages/c', 'packages/a'])
    expect(result.exceptions).toMatchObject([{ reason: 'Temporary migration', edges: [{ dependency: 'c' }] }])
    expect(result.summary).toEqual({ fail: 1, warn: 0, waived: 1 })
    config.exceptions!.push({ rule: 'cycle', source: 'packages/c', target: 'packages/a', type: 'dependencies', reason: 'Remaining return edge' })
    expect((await checkWorkspaceBoundaries(cwd, { config })).summary.fail).toBe(0)
  })

  it('respects per-rule dependency participation and reports unused exceptions', async () => {
    const cwd = await setup(diamond)
    const result = await checkWorkspaceBoundaries(cwd, { config: { cycles: false, rules: [{ id: 'no-peers', from: { packages: ['@test/tool'] }, allow: [], dependencyTypes: ['peerDependencies'], severity: 'warn' }], exceptions: [
      { rule: 'no-peers', source: 'packages/tool', target: 'packages/base', type: 'peerDependencies', reason: 'Adapter API' },
      { rule: 'no-peers', source: 'packages/tool', target: 'packages/base', type: 'dependencies', reason: 'Obsolete declaration' },
    ] } })
    expect(result.summary).toEqual({ fail: 0, warn: 1, waived: 1 })
    expect(result.findings[0]?.id).toBe('boundary-exception-unused')
  })

  it.each([
    null,
    { rules: [{ id: 'layer', from: { tags: ['unknown'] }, allow: [] }] },
    { rules: [{ id: 'cycle', from: { private: true }, allow: [] }] },
    { rules: [{ id: 'x', from: {}, allow: [] }] },
    { rules: [{ id: 'x', from: { packages: undefined }, allow: [] }] },
    { rules: [{ id: 'x', from: { private: undefined }, allow: [] }] },
    { rules: [{ id: 'x', from: { paths: ['../apps'] }, allow: [] }] },
    { cycles: { dependencyTypes: ['dev'] } },
    { cycles: { severity: 'ignore' } },
    { rules: [{ id: 'x', from: { private: true }, allow: [], typo: true }] },
    { exceptions: [{ rule: 'cycle', source: '.', target: '.', type: 'dependencies', reason: ' ' }] },
  ])('fails invalid runtime policy instead of silently skipping it: %j', async (config) => {
    const cwd = await setup(diamond)
    const result = await checkWorkspaceBoundaries(cwd, { config: config as WorkspaceBoundariesConfig })
    expect(result.findings).toMatchObject([{ id: 'boundary-config', status: 'fail', field: expect.stringContaining('boundaries') }])
  })

  it('reports stale alternatives even when another value matches and intersects selector fields', async () => {
    const cwd = await setup(diamond)
    const result = await checkWorkspaceBoundaries(cwd, { config: { cycles: false, rules: [{ id: 'stale', from: { packages: ['@test/a', '@test/missing'], paths: ['apps/**'] }, allow: [] }] } })
    expect(result.findings.every(item => item.id === 'boundary-selector-unmatched')).toBe(true)
    expect(result.findings).toHaveLength(2)
    expect(result.summary.fail).toBe(0)
  })

  it('retains incomplete graph diagnostics and never declares an unknown internal target safe', async () => {
    const cwd = await setup({ 'packages/a': { name: 'a', dependencies: { missing: 'workspace:*' } } })
    expect((await checkWorkspaceBoundaries(cwd)).findings).toMatchObject([{ id: 'boundary-graph', path: 'packages/a', field: 'dependencies.missing', status: 'fail' }])
  })

  it('rejects a null project policy in both API and doctor', async () => {
    const cwd = await setup(diamond)
    await writeFile(path.join(cwd, 'repoctl.config.mjs'), 'export default { boundaries: null }')
    expect((await checkWorkspaceBoundaries(cwd)).findings).toMatchObject([{ id: 'boundary-config', status: 'fail' }])
    await expect(runDoctor(cwd)).rejects.toMatchObject({
      code: 'REPOCTL_CONFIG_INVALID',
      message: expect.not.stringContaining(cwd),
      diagnostics: [{ id: 'config.invalid-type', path: 'boundaries', actualType: 'null' }],
    })
    await writeFile(path.join(cwd, 'repoctl.config.mjs'), 'export default { boundaries: { cycles: { severity: null } } }')
    expect((await checkWorkspaceBoundaries(cwd)).findings[0]?.field).toBe('boundaries.cycles.severity')
  })

  it('refreshes project policy and imported helpers in a long-running caller', async () => {
    const cwd = await setup(cycle)
    await writeFile(path.join(cwd, 'policy.mjs'), 'export default { cycles: false }')
    await writeFile(path.join(cwd, 'repoctl.config.mjs'), 'import boundaries from "./policy.mjs"; export default { boundaries }')
    expect((await checkWorkspaceBoundaries(cwd)).summary.fail).toBe(0)
    await writeFile(path.join(cwd, 'policy.mjs'), 'export default { cycles: { severity: "fail" } }')
    expect((await checkWorkspaceBoundaries(cwd)).summary.fail).toBe(1)
    await writeFile(path.join(cwd, 'repoctl.config.mjs'), 'export default { boundaries: { cycles: { severity: "warn" } } }')
    expect((await checkWorkspaceBoundaries(cwd)).summary).toEqual({ fail: 0, warn: 1, waived: 0 })
  })

  it('limits incomplete graph diagnostics to enabled dependency types and source selectors', async () => {
    const cwd = await setup({
      'packages/a': { name: 'a', devDependencies: { vitest: 'catalog:' } },
      'packages/b': { name: 'b', peerDependencies: { missing: 'workspace:*' } },
    })
    expect((await checkWorkspaceBoundaries(cwd)).summary.fail).toBe(0)
    const config: WorkspaceBoundariesConfig = { cycles: false, rules: [{ id: 'a', from: { packages: ['a'] }, allow: [], dependencyTypes: ['dependencies'] }] }
    expect((await checkWorkspaceBoundaries(cwd, { config })).summary.fail).toBe(0)
    config.rules![0]!.dependencyTypes = ['devDependencies']
    expect((await checkWorkspaceBoundaries(cwd, { config })).findings).toMatchObject([{ id: 'boundary-graph', path: 'packages/a' }])
    expect((await checkWorkspaceBoundaries(cwd, { config: { cycles: false } })).findings).toEqual([])
  })

  it('uses stable CLI JSON, warning exit policy and doctor integration without writes', async () => {
    const cwd = await setup(cycle)
    await writeFile(path.join(cwd, 'repoctl.config.mjs'), 'export default { boundaries: { cycles: { severity: "warn" } } }')
    const before = await fingerprint(cwd)
    const entry = fileURLToPath(new URL('../../../../repoctl/bin/repo.js', import.meta.url))
    const cli = (args: string[], locale: string) => spawnSync(process.execPath, [entry, 'workspace', 'boundaries', ...args], { cwd, encoding: 'utf8', env: { ...process.env, REPOCTL_LOCALE: locale } })
    const english = cli(['--json'], 'en')
    const chinese = cli(['--json'], 'zh-CN')
    expect(english.status, english.stderr).toBe(0)
    expect(JSON.parse(chinese.stdout)).toEqual(JSON.parse(english.stdout))
    expect(cli(['--json', '--strict'], 'en').status).toBe(1)
    expect(cli([], 'en').stdout).toContain('packages/a -> packages/c -> packages/a')
    const doctor = await runDoctor(cwd)
    expect(doctor.checks.find(item => item.id === 'boundary-cycle')).toMatchObject({ status: 'warn', detail: expect.stringContaining('dependencies.c') })
    expect(await fingerprint(cwd)).toEqual(before)
  })
})
