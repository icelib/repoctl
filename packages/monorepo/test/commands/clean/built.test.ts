import { spawnSync } from 'node:child_process'
import { access, link, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import process from 'node:process'
import path from 'pathe'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createCleanFixture, snapshotTree } from './fixture'

const cli = path.resolve(import.meta.dirname, '../../../bin/repo.js')
let fixture: Awaited<ReturnType<typeof createCleanFixture>>
beforeEach(async () => {
  fixture = await createCleanFixture()
})
afterEach(async () => {
  await rm(fixture.root, { recursive: true, force: true })
})

function run(args: string[], cwd = fixture.workspace, lang = 'en') {
  return spawnSync(process.execPath, [cli, '--lang', lang, 'workspace', 'clean', ...args], {
    cwd,
    encoding: 'utf8',
    timeout: 30_000,
    env: { ...process.env, HOME: fixture.home, USERPROFILE: fixture.home, REPOCTL_LANG: lang, NO_COLOR: '1', NODE_ENV: 'production', CONSOLA_LEVEL: '3' },
  })
}

async function config(value: object) {
  await writeFile(path.join(fixture.workspace, 'repoctl.config.mjs'), `export default ${JSON.stringify({ commands: { clean: value } })}`)
}

describe('built clean CLI', () => {
  it('previews all deletions and metadata changes without writes, then applies exactly that plan', async () => {
    await config({ ignorePackages: ['pkg-b'] })
    const before = await snapshotTree(fixture.root)
    const preview = run(['--yes', '--dry-run', '--pinned-version', 'next'], path.join(fixture.workspace, 'packages/a'))
    expect(preview.status, preview.stderr).toBe(0)
    const plan = JSON.parse(preview.stdout)
    expect(plan).toEqual({
      workspaceDir: fixture.workspace,
      deletions: ['packages/a'],
      metadata: { path: 'package.json', changes: [
        { field: 'devDependencies.@icebreakers/monorepo', before: '^1.0.0', after: null },
        { field: 'devDependencies.repoctl', before: '^5.6.0', after: 'next' },
      ] },
    })
    expect(await snapshotTree(fixture.root)).toEqual(before)
    const applied = run(['--yes', '--pinned-version', 'next'])
    expect(applied.status, applied.stderr).toBe(0)
    const after = await snapshotTree(fixture.root)
    for (const [file, content] of Object.entries(before)) {
      if (file.startsWith('workspace/packages/a/')) {
        expect(after).not.toHaveProperty(file)
      }
      else if (file !== 'workspace/package.json') {
        expect(after[file]).toBe(content)
      }
    }
    expect(JSON.parse(await readFile(path.join(fixture.workspace, 'package.json'), 'utf8')).devDependencies).toEqual({ repoctl: 'next', other: '^1.0.0' })
  })

  it('preserves metadata byte-for-byte when the dependency already needs no repair', async () => {
    const manifest = path.join(fixture.workspace, 'package.json')
    await writeFile(manifest, '{ "name": "fixture", "devDependencies": { "repoctl": "workspace:*" } }')
    const before = (await snapshotTree(fixture.root))['workspace/package.json']
    const preview = run(['--yes', '--dry-run'])
    expect(preview.status, preview.stderr).toBe(0)
    expect(JSON.parse(preview.stdout).metadata).toBeNull()
    expect(run(['--yes']).status).toBe(0)
    expect((await snapshotTree(fixture.root))['workspace/package.json']).toBe(before)
  })

  it('repairs a missing dependency only after a nonempty selection', async () => {
    const manifest = path.join(fixture.workspace, 'package.json')
    await writeFile(manifest, '{ "name": "fixture" }')
    expect(run(['--yes']).status).toBe(0)
    expect(JSON.parse(await readFile(manifest, 'utf8')).devDependencies.repoctl).toBe('latest')
    const before = await snapshotTree(fixture.root)
    expect(run(['--yes', '--pinned-version', 'canary']).status).toBe(0)
    expect(await snapshotTree(fixture.root)).toEqual(before)
  })

  it('uses configured private filtering and explicit --include-private overrides', async () => {
    await config({ includePrivate: false })
    const preview = run(['--yes', '--dry-run'])
    expect(JSON.parse(preview.stdout).deletions).toEqual(['packages/a'])
    const include = run(['--yes', '--dry-run', '--include-private'])
    expect(JSON.parse(include.stdout).deletions).toEqual(['packages/a', 'packages/b'])
  })

  it('honors configured dry-run without changing the filesystem', async () => {
    await config({ autoConfirm: true, dryRun: true })
    const before = await snapshotTree(fixture.root)
    const result = run([])
    expect(result.status, result.stderr).toBe(0)
    expect(JSON.parse(result.stdout).deletions).toEqual(['packages/a', 'packages/b'])
    expect(await snapshotTree(fixture.root)).toEqual(before)
  })

  it.each(['en', 'zh-CN'])('documents dry-run and selection in %s help', (lang) => {
    const result = run(['--help'], fixture.workspace, lang)
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('--dry-run')
    expect(result.stdout).toContain(lang === 'en' ? 'metadata changes' : '元数据变更')
  })

  it('rejects an external workspace pattern before deleting a valid package', async () => {
    const outside = path.join(fixture.root, 'outside')
    await mkdir(outside)
    await writeFile(path.join(outside, 'package.json'), '{"name":"outside"}')
    await writeFile(path.join(fixture.workspace, 'pnpm-workspace.yaml'), 'packages:\n  - packages/*\n  - ../outside\n')
    const before = await snapshotTree(fixture.root)
    const result = run(['--yes'])
    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('Unsafe cleanup target')
    expect(await snapshotTree(fixture.root)).toEqual(before)
  })

  it.each(['target', 'parent', 'metadata'])('rejects %s symlink escapes before any deletion', async (kind) => {
    const outside = path.join(fixture.root, 'outside')
    await mkdir(outside)
    await writeFile(path.join(outside, 'package.json'), '{"name":"outside"}')
    if (kind === 'metadata') {
      await rm(path.join(fixture.workspace, 'package.json'))
      await symlink(path.join(outside, 'package.json'), path.join(fixture.workspace, 'package.json'))
    }
    else if (kind === 'parent') {
      await mkdir(path.join(outside, 'nested'))
      await writeFile(path.join(outside, 'nested/package.json'), '{"name":"nested"}')
      await symlink(outside, path.join(fixture.workspace, 'linked'), 'dir')
      await writeFile(path.join(fixture.workspace, 'pnpm-workspace.yaml'), 'packages:\n  - packages/*\n  - linked/*\n')
    }
    else {
      await symlink(outside, path.join(fixture.workspace, 'packages/linked'), 'dir')
    }
    const before = await snapshotTree(fixture.root)
    const result = run(['--yes'])
    expect(result.status, result.stdout).not.toBe(0)
    expect(await snapshotTree(fixture.root)).toEqual(before)
  })

  it('rejects symlinks within the workspace before deleting any package', async () => {
    await symlink(path.join(fixture.workspace, 'packages/a'), path.join(fixture.workspace, 'packages/linked'), 'dir')
    const before = await snapshotTree(fixture.root)
    expect(run(['--yes']).status).not.toBe(0)
    expect(await snapshotTree(fixture.root)).toEqual(before)
  })

  it('rejects hardlinked metadata before deleting any package', async () => {
    await link(path.join(fixture.workspace, 'package.json'), path.join(fixture.root, 'outside.json'))
    const before = await snapshotTree(fixture.root)
    expect(run(['--yes']).status).not.toBe(0)
    expect(await snapshotTree(fixture.root)).toEqual(before)
  })

  it('rejects invalid root dependencies before deleting any package', async () => {
    await writeFile(path.join(fixture.workspace, 'package.json'), '{"name":"fixture","devDependencies":[]}')
    const before = await snapshotTree(fixture.root)
    expect(run(['--yes']).status).not.toBe(0)
    expect(await snapshotTree(fixture.root)).toEqual(before)
  })

  it('rejects removing an unselected nested workspace', async () => {
    const nested = path.join(fixture.workspace, 'packages/a/nested')
    await mkdir(nested)
    await writeFile(path.join(nested, 'package.json'), '{"name":"nested"}')
    await config({ ignorePackages: ['nested'] })
    const before = await snapshotTree(fixture.root)
    const result = run(['--yes'])
    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('unselected workspace')
    expect(await snapshotTree(fixture.root)).toEqual(before)
    await access(path.join(fixture.workspace, 'packages/a'))
  })
})
