import type { ReleasePlanOptions } from '@icebreakers/monorepo'
import { readFile, rm } from 'node:fs/promises'
import path from 'node:path'
import { createReleasePlan } from '@icebreakers/monorepo'
import crossSpawn from 'cross-spawn'
import { afterEach, describe, expect, it } from 'vitest'
import { cli, fixture, snapshot } from './fixture'

const roots: string[] = []
async function workspace() {
  const result = await fixture()
  roots.push(result.cwd)
  return result
}
afterEach(async () => {
  await Promise.all(roots.splice(0).map(cwd => rm(cwd, { recursive: true, force: true })))
})

describe('built read-only native release plan', () => {
  it('matches actual native versioning for intents, fixed groups, dependent and private packages', async () => {
    const f = await workspace()
    const before = await snapshot(f.cwd)
    const plan = await createReleasePlan({ cwd: f.cwd })
    expect(plan.status, JSON.stringify(plan.blockers)).toBe('ready')
    expect(plan.packages.find(pkg => pkg.name === 'a')).toMatchObject({ currentVersion: '1.0.0', newVersion: '2.0.0', publishCandidate: true })
    expect(plan.packages.find(pkg => pkg.name === 'b')?.reasons).toContain('fixed')
    expect(plan.packages.find(pkg => pkg.name === 'consumer')?.reasons).toContain('dependencies')
    expect(plan.packages.find(pkg => pkg.name === 'private-lib')).toMatchObject({ private: true, publishCandidate: false })
    expect(plan.notes.entries.some(entry => entry.summary === 'Add useful feature.')).toBe(true)
    expect(await snapshot(f.cwd)).toEqual(before)
    expect(await createReleasePlan({ cwd: f.cwd })).toEqual(plan)

    const actual = crossSpawn.sync('pnpm', ['version', '-r', '--json', '--no-git-checks', '--config.ignore-scripts=true', '--config.ignore-pnpmfile=true'], { cwd: f.cwd, encoding: 'utf8' })
    expect(actual.status, actual.stderr).toBe(0)
    for (const pkg of plan.packages) {
      const manifest = JSON.parse(await readFile(path.join(f.cwd, pkg.directory, 'package.json'), 'utf8'))
      expect(manifest.version).toBe(pkg.newVersion)
    }
  }, 60000)

  it('prints the same plan as JSON and Markdown without changing Git or package files', async () => {
    const f = await workspace()
    const before = await snapshot(f.cwd)
    const json = cli(f.cwd, ['--json'])
    expect(json.status, json.stderr).toBe(0)
    const plan = JSON.parse(json.stdout)
    const markdown = cli(f.cwd, ['--markdown'])
    expect(markdown.status, markdown.stderr).toBe(0)
    for (const pkg of plan.packages) {
      expect(markdown.stdout).toContain(`| ${pkg.name} | ${pkg.currentVersion} | ${pkg.newVersion} |`)
    }
    expect(markdown.stdout).toContain('Add useful feature.')
    expect(await snapshot(f.cwd)).toEqual(before)
  }, 60000)

  it('reports empty intents without writing or invoking release hooks', async () => {
    const f = await workspace()
    await rm(path.join(f.cwd, '.changeset/test.md'))
    const before = await snapshot(f.cwd)
    const plan = await createReleasePlan({ cwd: f.cwd })
    expect(plan).toMatchObject({ status: 'empty', packages: [], blockers: [] })
    expect(await snapshot(f.cwd)).toEqual(before)
  })

  it('reports invalid intents with a nonzero CLI exit and leaves the inputs intact', async () => {
    const f = await workspace()
    await f.write('.changeset/test.md', '---\na: invalid\n---\nBad input.\n')
    const before = await snapshot(f.cwd)
    const result = cli(f.cwd, ['--json'])
    expect(result.status).toBe(1)
    expect(JSON.parse(result.stdout)).toMatchObject({ status: 'blocked', packages: [] })
    expect(await snapshot(f.cwd)).toEqual(before)
  })

  it('does not attribute already consumed prose to a package bumped by a fixed group', async () => {
    const f = await workspace()
    await f.write('.changeset/test.md', '---\na: major\nb: minor\n---\nPartially consumed feature.\n')
    await f.write('.changeset/ledger.yaml', 'a@1.0.0:\n  dir: packages/a\n  intents: [test]\n')
    const before = await snapshot(f.cwd)
    const plan = await createReleasePlan({ cwd: f.cwd })
    expect(plan.status, JSON.stringify(plan.blockers)).toBe('ready')
    expect(plan.packages.find(pkg => pkg.name === 'a')).toMatchObject({ newVersion: '1.1.0', reasons: ['fixed'], intents: [] })
    expect(plan.packages.find(pkg => pkg.name === 'b')?.intents).toMatchObject([{ path: '.changeset/test.md', bump: 'minor' }])
    expect(await snapshot(f.cwd)).toEqual(before)
  })

  it('includes root package intents with the same version as native pnpm', async () => {
    const f = await workspace()
    const root = JSON.parse(await readFile(path.join(f.cwd, 'package.json'), 'utf8'))
    await f.write('package.json', JSON.stringify({ ...root, name: 'root-pkg', version: '1.0.0' }))
    await f.write('.changeset/test.md', '---\nroot-pkg: minor\na: patch\n---\nRoot feature.\n')
    const before = await snapshot(f.cwd)
    const plan = await createReleasePlan({ cwd: f.cwd })
    expect(plan.status, JSON.stringify(plan.blockers)).toBe('ready')
    expect(plan.packages.find(pkg => pkg.name === 'root-pkg')).toMatchObject({ directory: '.', currentVersion: '1.0.0', newVersion: '1.1.0', private: true, publishCandidate: false, intents: [{ bump: 'minor', summary: 'Root feature.' }] })
    expect(await snapshot(f.cwd)).toEqual(before)
    const actual = crossSpawn.sync('pnpm', ['version', '-r', '--json', '--no-git-checks', '--config.ignore-scripts=true', '--config.ignore-pnpmfile=true'], { cwd: f.cwd, encoding: 'utf8' })
    expect(actual.status, actual.stderr).toBe(0)
    expect(JSON.parse(await readFile(path.join(f.cwd, 'package.json'), 'utf8')).version).toBe('1.1.0')
  })

  it('never calls version without a verified dry-run capability', async () => {
    const f = await workspace()
    const calls: string[][] = []
    const spawn = ((_command: string, args: string[]) => {
      calls.push(args)
      return { status: 0, stdout: args.includes('--version') ? '9.0.0' : 'Usage: version (no recursive preview)', stderr: '' }
    }) as NonNullable<ReleasePlanOptions['spawn']>
    const plan = await createReleasePlan({ cwd: f.cwd, spawn })
    expect(plan).toMatchObject({ status: 'blocked', blockers: [{ id: 'unsupported-pnpm-plan' }] })
    expect(calls.map(args => args.filter(arg => !arg.startsWith('--config.')))).toEqual([['--version'], ['version', '--help']])
  })
})
