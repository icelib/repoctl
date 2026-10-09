import type { GitHubOperations, ReleaseCiOptions } from '@icebreakers/monorepo'
import { readFile } from 'node:fs/promises'
import { enterPrerelease, releaseCi } from '@icebreakers/monorepo'
import path from 'pathe'
import { expect, it, vi } from 'vitest'
import { lineFixture } from './lines/fixture'

it.each(['stable', 'prerelease'])('keeps %s preparation hooks ordered across real stages', async (kind) => {
  const h = await lineFixture()
  await h.write('package.json', JSON.stringify({ private: true, scripts: { before: 'node event.cjs before', quality: 'node event.cjs quality', after: 'node event.cjs after' } }))
  await h.write('event.cjs', 'const fs = require("node:fs"); const file = "events.json"; const events = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file)) : []; events.push(process.argv[2]); fs.writeFileSync(file, JSON.stringify(events));')
  await h.write('.gitignore', 'events.json\nnode_modules\n')
  const github: GitHubOperations = { ensurePullRequest: vi.fn(), ensureRelease: vi.fn(), readReleaseState: vi.fn(async () => undefined), writeReleaseState: vi.fn(async () => '1') }
  const native = h.options.spawn!
  const spawn: typeof native = ((command: string, args: string[], settings: never) => {
    if (command === 'git' && args[0] === 'push') {
      return { status: 0, stdout: '', stderr: '' }
    }
    return native(command, args, settings)
  }) as typeof native
  const options: ReleaseCiOptions = { ...h.options, spawn, github, mode: 'auto', env: { ...h.env, GITHUB_REPOSITORY: 'acme/repo', HUSKY: '0' }, config: { ...h.options.config, qualityScripts: ['quality'], hooks: { beforeVersion: ['before'], afterVersion: ['after'] } } }
  if (kind === 'prerelease') {
    await enterPrerelease('beta', options)
    options.branch = 'preview/1.x'
  }
  await releaseCi({ ...options, stage: 'plan' })
  await releaseCi({ ...options, stage: 'verify' })
  expect(JSON.parse(await readFile(path.join(h.cwd, 'events.json'), 'utf8'))).toEqual(['before', 'quality'])
  const result = await releaseCi({ ...options, stage: 'prepare' })
  expect(result).toMatchObject({ publish: kind === 'prerelease' })
  expect(JSON.parse(await readFile(path.join(h.cwd, 'events.json'), 'utf8'))).toEqual(['before', 'quality', 'after'])
  expect(github.ensurePullRequest).toHaveBeenCalledTimes(kind === 'stable' ? 1 : 0)
  const version = JSON.parse(await readFile(path.join(h.cwd, 'packages/a/package.json'), 'utf8')).version
  expect(version).toMatch(kind === 'stable' ? /^1\.0\.1$/ : /^1\.0\.1-beta\./)
  expect(h.git('ls-files', 'repoctl-ci-progress.json')).toBe('')
}, 60_000)
