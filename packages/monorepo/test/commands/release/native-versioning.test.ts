import type { ReleaseCiOptions } from '@icebreakers/monorepo'
import { spawnSync } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import process from 'node:process'
import { Worker } from 'node:worker_threads'
import { releaseCi } from '@icebreakers/monorepo'
import path from 'pathe'
import { afterEach, expect, it, vi } from 'vitest'
import { cleanupReleaseTempRoots, createTempWorkspace, writePendingIntent } from '../release-fixtures'

afterEach(cleanupReleaseTempRoots)

async function fixture() {
  const cwd = await createTempWorkspace('main')
  const env = { ...process.env, HUSKY: '0', GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 'test@example.invalid', GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 'test@example.invalid' }
  const git = (...args: string[]) => {
    const result = spawnSync('git', args, { cwd, env, encoding: 'utf8' })
    if (result.status !== 0) {
      throw new Error(result.stderr)
    }
    return result.stdout.trim()
  }
  const rootManifest = JSON.parse(await readFile(path.resolve(import.meta.dirname, '../../../../../package.json'), 'utf8'))
  await writeFile(path.join(cwd, 'package.json'), JSON.stringify({ private: true }))
  const installed = spawnSync(process.env['npm_execpath'] ?? 'pnpm', ['--version'], { cwd, env, encoding: 'utf8' })
  expect(installed.stdout.trim()).toBe(rootManifest.packageManager.replace('pnpm@', ''))
  await writeFile(path.join(cwd, 'pnpm-workspace.yaml'), 'packages:\n  - packages/*\npmOnFail: error\nversioning:\n  changelog:\n    storage: repository\n')
  await writeFile(path.join(cwd, '.changeset/ledger.yaml'), '{}\n')
  git('init', '-b', 'main')
  git('add', '.')
  git('-c', 'commit.gpgsign=false', 'commit', '-m', 'initial')
  return { cwd, env, git }
}

it('uses native pnpm results and blocks a second intent until the original release completes', async () => {
  const h = await fixture()
  const server = new Worker(`
    const { parentPort } = require('node:worker_threads');
    require('node:http').createServer((req, res) => {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({name:'repoctl', 'dist-tags':{latest:'1.0.0'}, versions:{'1.0.0':{name:'repoctl',version:'1.0.0'}}}));
    }).listen(0, '127.0.0.1', function () { parentPort.postMessage(this.address().port); });
  `, { eval: true })
  try {
    const port = await new Promise<number>((resolve, reject) => {
      server.once('message', resolve)
      server.once('error', reject)
    })
    await writeFile(path.join(h.cwd, '.npmrc'), `registry=http://127.0.0.1:${port}\n`)
    const env = { ...h.env, npm_config_registry: `http://127.0.0.1:${port}`, GITHUB_REPOSITORY: 'acme/repo' }
    let published = false
    const spawn: NonNullable<ReleaseCiOptions['spawn']> = ((command: string, args: string[], options: Parameters<typeof spawnSync>[2]) => {
      if (command === 'git' && args[0] === 'push') {
        return { status: 0, stdout: '', stderr: '' }
      }
      if (command === 'npm' && args[0] === 'view') {
        return published
          ? { status: 0, stdout: JSON.stringify({ 'version': '1.0.1', 'gitHead': h.git('rev-parse', 'HEAD'), 'dist-tags': { latest: '1.0.1' } }) }
          : { status: 1, stderr: 'E404 Not Found', stdout: '' }
      }
      const result = spawnSync(command === 'pnpm' ? process.env['npm_execpath'] ?? command : command, command === 'pnpm' ? [...args, `--registry=http://127.0.0.1:${port}`] : args, options)
      if (command === 'pnpm' && result.status !== 0) {
        throw new Error(`${String(result.error ?? '')} ${String(result.stdout ?? '')} ${String(result.stderr ?? '')}`)
      }
      return result
    }) as NonNullable<ReleaseCiOptions['spawn']>
    const github = { ensurePullRequest: vi.fn(), ensureRelease: vi.fn() }
    const options: ReleaseCiOptions = { cwd: h.cwd, branch: 'main', mode: 'prepare', env, spawn, github, config: { qualityScripts: [] } }
    await writePendingIntent(h.cwd)
    await writeFile(path.join(h.cwd, '.changeset/declined.md'), '---\nrepoctl: none\n---\nTests only.')
    await releaseCi(options)
    expect(JSON.parse(await readFile(path.join(h.cwd, 'packages/repoctl/package.json'), 'utf8')).version).toBe('1.0.1')
    expect(github.ensurePullRequest).toHaveBeenCalledWith(expect.objectContaining({ body: expect.stringContaining('1 package updated') }))
    const source = h.git('rev-parse', 'HEAD')
    h.git('checkout', '-B', 'main')
    await writePendingIntent(h.cwd, 'later')
    const intent = await readFile(path.join(h.cwd, '.changeset/later.md'), 'utf8')
    await expect(releaseCi(options)).rejects.toThrow(`--source-sha ${source}`)
    expect(await readFile(path.join(h.cwd, '.changeset/later.md'), 'utf8')).toBe(intent)
    expect((await readFile(path.join(h.cwd, 'packages/repoctl/CHANGELOG.md'), 'utf8')).match(/## 1\.0\.1/g)).toHaveLength(1)
    published = true
    // Read-only preparation guard succeeds once npm confirms the prepared version.
    const { assertPreviousReleaseComplete } = await import('@/commands/release/preparation/guard')
    await expect(assertPreviousReleaseComplete(options)).resolves.toBeUndefined()
  }
  finally {
    await server.terminate()
  }
}, 60_000)

it('recovers only versions introduced by the original source; dry-run does not install or upload', async () => {
  const h = await fixture()
  await mkdir(path.join(h.cwd, 'packages/create-demo'))
  await writeFile(path.join(h.cwd, 'packages/create-demo/package.json'), JSON.stringify({ name: 'create-demo', version: '0.1.0' }))
  h.git('add', '.')
  h.git('-c', 'commit.gpgsign=false', 'commit', '-m', 'add dependent')
  await writeFile(path.join(h.cwd, 'packages/create-demo/package.json'), JSON.stringify({ name: 'create-demo', version: '0.1.1' }))
  await writeFile(path.join(h.cwd, 'packages/repoctl/package.json'), JSON.stringify({ name: 'repoctl', version: '1.0.1' }))
  await writeFile(path.join(h.cwd, 'packages/repoctl/CHANGELOG.md'), '# repoctl\n\n## 1.0.1\n\n- Original release.\n')
  await writeFile(path.join(h.cwd, '.changeset/ledger.yaml'), 'repoctl@1.0.1:\n  dir: packages/repoctl\n  intents: [original]\n')
  await writeFile(path.join(h.cwd, '.changeset/declined.md'), '---\nrepoctl: none\n---\nTests only.')
  h.git('add', '.')
  h.git('-c', 'commit.gpgsign=false', 'commit', '-m', 'chore(release): version packages')
  const source = h.git('rev-parse', 'HEAD')
  await writePendingIntent(h.cwd, 'later')
  await writeFile(path.join(h.cwd, 'packages/repoctl/CHANGELOG.md'), '# Later, unrelated contents\n')
  h.git('add', '.')
  h.git('-c', 'commit.gpgsign=false', 'commit', '-m', 'later changes')
  h.git('update-ref', 'refs/remotes/origin/main', 'HEAD')
  const calls: string[] = []
  const spawn = ((command: string, args: string[], options: Parameters<typeof spawnSync>[2]) => {
    calls.push(`${command} ${args.join(' ')}`)
    if (command === 'npm') {
      return { status: 1, stdout: '', stderr: 'E404 Not Found' }
    }
    return spawnSync(command, args, options)
  }) as NonNullable<ReleaseCiOptions['spawn']>
  const github = { ensurePullRequest: vi.fn(), ensureRelease: vi.fn(), ensureTag: vi.fn(), listReleases: vi.fn(async () => []), readReleaseState: vi.fn(async () => undefined), writeReleaseState: vi.fn() }
  const options: ReleaseCiOptions = { cwd: h.cwd, sourceSha: source, mode: 'auto', dryRun: true, github, spawn, env: { ...h.env, GITHUB_REPOSITORY: 'acme/repo', REPO_RELEASE_MODE: 'publish' }, config: { qualityScripts: [] } }
  await expect(releaseCi(options)).resolves.toEqual(expect.arrayContaining([{ name: 'repoctl', version: '1.0.1' }, { name: 'create-demo', version: '0.1.1' }]))
  expect(calls.some(call => call.startsWith('pnpm '))).toBe(false)
  expect(github.writeReleaseState).not.toHaveBeenCalled()
  expect(github.ensureRelease).not.toHaveBeenCalled()
  expect(await readFile(path.join(h.cwd, 'packages/repoctl/CHANGELOG.md'), 'utf8')).toBe('# Later, unrelated contents\n')
  await expect(releaseCi({ ...options, sourceSha: 'short' })).rejects.toThrow('full lowercase commit SHA')
  await expect(releaseCi({ ...options, sourceSha: 'a'.repeat(40) })).rejects.toThrow()
})
