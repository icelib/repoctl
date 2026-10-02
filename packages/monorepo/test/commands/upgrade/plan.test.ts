import { execFileSync } from 'node:child_process'
import { mkdtemp, readdir, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { resolveUpgradePlan, upgradeMonorepo } from '@icebreakers/monorepo'
import { afterEach, describe, expect, it } from 'vitest'
import fs from '../../../src/utils/fs'

const roots: string[] = []
const cli = path.resolve(import.meta.dirname, '../../../bin/repo.js')

async function workspace(options: { custom?: boolean, pre?: string } = {}) {
  const cwd = await mkdtemp(path.join(tmpdir(), 'repoctl-upgrade-plan-'))
  roots.push(cwd)
  await fs.outputJson(path.join(cwd, 'package.json'), {
    name: 'demo',
    private: true,
    devDependencies: { '@changesets/cli': '^2.0.0' },
  })
  await writeFile(path.join(cwd, 'repoctl.config.mjs'), `export default ${JSON.stringify({ commands: { upgrade: {
    targets: ['package.json', 'pnpm-workspace.yaml', '.github/workflows/release.yml'],
    mergeTargets: false,
  } } })}`)
  await writeFile(path.join(cwd, 'pnpm-workspace.yaml'), 'packages:\n  - packages/*\n')
  await fs.outputJson(path.join(cwd, 'packages/demo/package.json'), { name: 'demo-package', version: '1.0.0' })
  await fs.outputFile(path.join(cwd, '.github/workflows/release.yml'), options.custom ? 'name: custom\njobs: {}\n' : 'uses: changesets/action\nrun: changeset publish\n')
  await fs.outputJson(path.join(cwd, '.changeset/config.json'), { changelog: false })
  if (options.pre !== undefined) {
    await fs.outputFile(path.join(cwd, '.changeset/pre.json'), options.pre)
  }
  return cwd
}

async function snapshot(cwd: string, relativePath = ''): Promise<Record<string, string>> {
  const result: Record<string, string> = {}
  for (const entry of await readdir(path.join(cwd, relativePath), { withFileTypes: true })) {
    const key = path.posix.join(relativePath, entry.name)
    if (entry.isDirectory()) {
      result[`${key}/`] = ''
      Object.assign(result, await snapshot(cwd, key))
    }
    else {
      result[key] = (await readFile(path.join(cwd, key))).toString('base64')
    }
  }
  return result
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

describe('built upgrade plan and CLI', () => {
  it('previews dependent writes and deletions without changing any file', async () => {
    const cwd = await workspace({ pre: '{"mode":"pre","tag":"beta"}' })
    const before = await snapshot(cwd)
    const plan = await resolveUpgradePlan({ cwd, yes: true })
    expect(plan.files).toContainEqual(expect.objectContaining({ path: '.changeset/pre.json', action: 'delete', requiresConfirmation: true, dependsOn: expect.arrayContaining(['pnpm-workspace.yaml', '.github/workflows/release.yml']) }))
    expect(await snapshot(cwd)).toEqual(before)
    expect(JSON.parse(JSON.stringify(plan))).toEqual(plan)
  })

  it.each([['upgrade'], ['workspace', 'upgrade']])('JSON is a pure preview for %j', async (...command) => {
    const cwd = await workspace()
    const before = await snapshot(cwd)
    const stdout = execFileSync(process.execPath, [cli, ...command, '--json'], { cwd, encoding: 'utf8' })
    const plan = JSON.parse(stdout)
    expect(await realpath(plan.targetDir)).toBe(await realpath(cwd))
    expect(plan.files.some((file: { action: string }) => file.action === 'delete')).toBe(true)
    expect(await snapshot(cwd)).toEqual(before)
  })

  it('shows migration dependencies in the human-readable dry-run preview', async () => {
    const cwd = await workspace({ pre: '{"mode":"pre","tag":"beta"}' })
    const before = await snapshot(cwd)
    const stdout = execFileSync(process.execPath, [cli, 'upgrade', '--dry-run'], { cwd, encoding: 'utf8' })

    expect(stdout).toContain('delete: .changeset/pre.json (legacy-release) [confirmation required] [depends on:')
    expect(stdout).toContain('.github/workflows/release.yml')
    expect(stdout).toContain('pnpm-workspace.yaml')
    expect(stdout).toContain('package.json')
    expect(await snapshot(cwd)).toEqual(before)
  })

  it('includes bounded content summaries without changing the target', async () => {
    const cwd = await workspace()
    const before = await snapshot(cwd)
    const plan = await resolveUpgradePlan({ cwd, yes: true })
    const packageFile = plan.files.find(file => file.path === 'package.json')
    expect(packageFile?.diff).toMatchObject({
      kind: 'text',
      beforeBytes: expect.any(Number),
      afterBytes: expect.any(Number),
      beforeHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      afterHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      addedLines: expect.any(Number),
      deletedLines: expect.any(Number),
      truncated: false,
    })
    expect(packageFile?.diff?.text).toBeUndefined()
    expect(await snapshot(cwd)).toEqual(before)
  })

  it('adds a bounded unified diff only when explicitly requested', async () => {
    const cwd = await workspace()
    const plan = await resolveUpgradePlan({ cwd, yes: true, diff: true })
    const packageFile = plan.files.find(file => file.path === 'package.json')
    expect(packageFile?.diff?.text).toContain('--- a/package.json')
    expect(packageFile?.diff?.text).toContain('+++ b/package.json')
    expect(packageFile?.diff?.text?.length).toBeLessThanOrEqual(16 * 1024)
  })

  it('renders the explicit CLI diff preview without writing files', async () => {
    const cwd = await workspace()
    const before = await snapshot(cwd)
    const stdout = execFileSync(process.execPath, [cli, 'upgrade', '--diff'], { cwd, encoding: 'utf8' })
    expect(stdout).toContain('--- a/package.json')
    expect(stdout).toContain('+++ b/package.json')
    expect(stdout).toContain('Dry run only; no files were written.')
    expect(await snapshot(cwd)).toEqual(before)
  })

  it.each([{ noOverwrite: true }, { skipOverwrite: true }, { overwrite: false }])('preserves all release files when requested: %j', async (options) => {
    const cwd = await workspace({ pre: '{"mode":"pre","tag":"beta"}' })
    const before = await snapshot(cwd)
    await upgradeMonorepo({ cwd, yes: true, ...options })
    expect(await snapshot(cwd)).toEqual(before)
  })

  it('preserves custom workflow, release dependencies and legacy state', async () => {
    const cwd = await workspace({ custom: true })
    await upgradeMonorepo({ cwd, yes: true })
    expect(await readFile(path.join(cwd, '.github/workflows/release.yml'), 'utf8')).toContain('name: custom')
    expect(await fs.pathExists(path.join(cwd, '.changeset/config.json'))).toBe(true)
    expect((await fs.readJson(path.join(cwd, 'package.json'))).devDependencies['@changesets/cli']).toBe('^2.0.0')
  })

  it('migrates the entire accepted group and is idempotent', async () => {
    const cwd = await workspace({ pre: '{"mode":"pre","tag":"beta"}' })
    await upgradeMonorepo({ cwd, yes: true })
    expect(await fs.pathExists(path.join(cwd, '.changeset/config.json'))).toBe(false)
    expect(await fs.pathExists(path.join(cwd, '.changeset/pre.json'))).toBe(false)
    expect(await readFile(path.join(cwd, 'pnpm-workspace.yaml'), 'utf8')).toContain('demo-package: beta')
    expect((await fs.readJson(path.join(cwd, 'package.json'))).devDependencies['@changesets/cli']).toBeUndefined()
    const before = await snapshot(cwd)
    await upgradeMonorepo({ cwd, yes: true })
    expect(await snapshot(cwd)).toEqual(before)
  })

  it.each(['{invalid', '{"mode":"exit","tag":"beta"}'])('preserves unknown prerelease state: %s', async (pre) => {
    const cwd = await workspace({ pre })
    const plan = await resolveUpgradePlan({ cwd, yes: true })
    expect(plan.files).toContainEqual(expect.objectContaining({ path: '.changeset/config.json', action: 'skip', reason: 'invalid-prerelease-state' }))
    await upgradeMonorepo({ cwd, yes: true })
    expect(await readFile(path.join(cwd, '.changeset/pre.json'), 'utf8')).toBe(pre)
    expect(await fs.pathExists(path.join(cwd, '.changeset/config.json'))).toBe(true)
    expect(await readFile(path.join(cwd, '.github/workflows/release.yml'), 'utf8')).toContain('changesets/action')
  })

  it('preserves damaged legacy configuration and the workflow that uses it', async () => {
    const cwd = await workspace()
    await writeFile(path.join(cwd, '.changeset/config.json'), '{damaged')
    await upgradeMonorepo({ cwd, yes: true })
    expect(await readFile(path.join(cwd, '.changeset/config.json'), 'utf8')).toBe('{damaged')
    expect(await readFile(path.join(cwd, '.github/workflows/release.yml'), 'utf8')).toContain('changesets/action')
  })

  it('preserves a declined migration in noninteractive use', async () => {
    const cwd = await workspace()
    const before = await snapshot(cwd)
    execFileSync(process.execPath, [cli, 'upgrade'], { cwd, encoding: 'utf8', stdio: 'pipe' })
    expect(await snapshot(cwd)).toEqual(before)
  })
})
