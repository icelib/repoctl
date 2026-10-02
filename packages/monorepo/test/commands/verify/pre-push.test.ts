import { execFileSync } from 'node:child_process'
import { readFile, rename, rm } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { clearWorkspaceCache } from '@icebreakers/monorepo'
import { afterEach, describe, expect, it } from 'vitest'
import { createFixture, packageChecks, rootChecks, rootFullChecks, zeroSha } from './fixture'

const roots: string[] = []
async function fixture(patterns?: string[]) {
  const result = await createFixture(patterns)
  roots.push(result.cwd)
  return result
}

afterEach(async () => {
  clearWorkspaceCache()
  await Promise.all(roots.splice(0).map(cwd => rm(cwd, { recursive: true, force: true })))
})

describe('built pre-push API with real Git workspaces', () => {
  it('discovers private and custom workspaces, respects exclusions, and skips missing scripts', async () => {
    const f = await fixture()
    await f.addPackage('packages/utils')
    await f.addPackage('apps/admin', { private: true, scripts: ['build', 'test'] })
    await f.addPackage('domains/payments/lib', { scripts: ['test'] })
    await f.addPackage('packages/ignored')
    const base = f.commit()
    for (const dir of ['packages/utils', 'apps/admin', 'domains/payments/lib', 'packages/ignored']) {
      await f.write(`${dir}/src/index.ts`, 'export const changed = true\n')
    }
    f.commit()

    const { calls } = await f.run(base)
    expect(calls).toEqual([
      ...packageChecks('apps/admin', ['build', 'test']),
      ...packageChecks('domains/payments/lib', ['test']),
      ...packageChecks('packages/utils'),
      ...rootChecks,
    ])
  })

  it('refreshes discovery when a programmatic caller creates another workspace', async () => {
    const f = await fixture()
    await f.addPackage('packages/first')
    const base = f.commit()
    await f.write('packages/first/src/index.ts', 'changed\n')
    f.commit()
    expect((await f.run(base)).calls).toEqual([...packageChecks('packages/first'), ...rootChecks])

    await f.addPackage('apps/added', { private: true })
    f.commit()
    expect((await f.run(base)).calls).toEqual([
      ...packageChecks('apps/added'),
      ...packageChecks('packages/first'),
      ...rootChecks,
    ])
  })

  it('matches the deepest discovered directory without treating a name prefix as an owner', async () => {
    const f = await fixture(['packages/**', '!packages/utils-extra'])
    await f.addPackage('packages/utils')
    await f.addPackage('packages/utils/nested')
    await f.addPackage('packages/utils-extra')
    const base = f.commit()
    await f.write('packages/utils/nested/src/index.ts', 'nested change\n')
    await f.write('packages/utils-extra/src/index.ts', 'excluded change\n')
    f.commit()

    expect((await f.run(base)).calls).toEqual([...packageChecks('packages/utils/nested'), ...rootChecks])
  })

  it('keeps explicit unsorted workspace overrides and an explicit empty list', async () => {
    const f = await fixture(['apps/*'])
    await f.addPackage('custom/parent')
    await f.addPackage('custom/parent/child')
    const base = f.commit()
    await f.write('custom/parent/child/src/index.ts', 'changed\n')
    f.commit()
    // Overrides do not consult the manifest, even when it cannot be parsed.
    await f.write('pnpm-workspace.yaml', 'packages: [invalid')
    const workspaces = ['custom/parent', 'custom/parent/child', 'custom/parent/child']
    expect((await f.run(base, { workspaces })).calls).toEqual([
      ...packageChecks('custom/parent/child'),
      ...rootChecks,
    ])
    expect(workspaces).toEqual(['custom/parent', 'custom/parent/child', 'custom/parent/child'])
    expect((await f.run(base, { workspaces: [] })).calls).toEqual(rootChecks)
  })

  it('checks both owners of renamed files and preserves unusual deleted file names', async () => {
    const f = await fixture()
    await f.addPackage('packages/source')
    await f.addPackage('packages/destination')
    await f.addPackage('packages/deleted')
    const deleted = `packages/deleted/src/中文 with spaces${process.platform === 'win32' ? '' : '\nand newline'}.ts`
    await f.write(deleted, 'delete me\n')
    const base = f.commit()
    await rename(path.join(f.cwd, 'packages/source/src/index.ts'), path.join(f.cwd, 'packages/destination/src/moved.ts'))
    await rm(path.join(f.cwd, deleted))
    f.commit()

    expect((await f.run(base)).calls).toEqual([
      ...packageChecks('packages/deleted'),
      ...packageChecks('packages/destination'),
      ...packageChecks('packages/source'),
      ...rootChecks,
    ])
  })

  it('falls back to root tasks when a removed package manifest no longer has an owner', async () => {
    const f = await fixture()
    await f.addPackage('packages/removed')
    const base = f.commit()
    await rm(path.join(f.cwd, 'packages/removed'), { recursive: true })
    f.commit()
    expect((await f.run(base)).calls).toEqual(rootFullChecks)
  })

  it('preserves full root verification for root and hook configuration changes', async () => {
    const f = await fixture()
    const base = f.commit()
    await f.write('turbo.json', '{}')
    await f.write('.github/workflows/test.yml', 'name: fixture\n')
    await f.write('.husky/pre-push', 'fixture\n')
    f.commit()
    expect((await f.run(base)).calls).toEqual(rootFullChecks)
  })

  it('checks a new remote against the empty tree without running the root as a child package', async () => {
    const f = await fixture()
    await f.addPackage('apps/admin', { private: true })
    f.commit()
    expect((await f.run(zeroSha)).calls).toEqual([...packageChecks('apps/admin'), ...rootFullChecks])
  })

  it('ignores deleted refs and keeps the root lint/typecheck gate', async () => {
    const f = await fixture()
    const base = f.commit()
    expect((await f.run(base, { stdinText: f.stdin(base, zeroSha) })).calls).toEqual(rootChecks)
    expect((await f.run(base, { stdinText: '' })).calls).toEqual(rootChecks)
  })

  it('deduplicates tasks across multiple pushed refs', async () => {
    const f = await fixture()
    await f.addPackage('packages/utils')
    const base = f.commit()
    await f.write('packages/utils/src/index.ts', 'first\n')
    const first = f.commit()
    await f.write('packages/utils/src/index.ts', 'second\n')
    const second = f.commit()
    expect((await f.run(base, { stdinText: `${f.stdin(base, first)}\n${f.stdin(base, second)}` })).calls)
      .toEqual([...packageChecks('packages/utils'), ...rootChecks])
  })

  it('uses the workspace root when invoked from a child directory', async () => {
    const f = await fixture()
    await f.addPackage('apps/admin', { private: true })
    const base = f.commit()
    await f.write('apps/admin/src/index.ts', 'changed\n')
    f.commit()
    const result = await f.run(base, { cwd: path.join(f.cwd, 'apps/admin') })
    expect(result.calls).toEqual([...packageChecks('apps/admin'), ...rootChecks])
    expect(new Set(result.directories)).toEqual(new Set([f.cwd]))
  })

  it('fails instead of reporting success when workspace discovery cannot read the manifest', async () => {
    const f = await fixture()
    const base = f.commit()
    await f.write('pnpm-workspace.yaml', 'packages: [invalid')
    await expect(f.run(base)).rejects.toThrow()
  })
})

describe('built repoctl pre-push CLI', () => {
  it('runs real package and root scripts in a temporary workspace', async () => {
    const f = await fixture()
    await f.addPackage('apps/admin', { private: true, scripts: ['build', 'test'] })
    const base = f.commit()
    await f.write('apps/admin/src/index.ts', 'changed\n')
    f.commit()
    const log = path.join(f.cwd, 'checks.log')
    const cli = path.resolve(import.meta.dirname, '../../../../repoctl/bin/repo.js')
    execFileSync(process.execPath, [cli, 'verify', 'pre-push'], {
      cwd: f.cwd,
      input: f.stdin(base),
      encoding: 'utf8',
      env: { ...process.env, REPOCTL_VERIFY_FIXTURE_LOG: log },
    })
    const checks = (await readFile(log, 'utf8')).trim().split('\n').map(line => JSON.parse(line))
    expect(checks).toEqual([
      { cwd: path.join(f.cwd, 'apps/admin'), task: 'build' },
      { cwd: path.join(f.cwd, 'apps/admin'), task: 'test' },
      { cwd: f.cwd, task: 'lint' },
      { cwd: f.cwd, task: 'typecheck' },
    ])
  })
})
