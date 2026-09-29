import { spawnSync } from 'node:child_process'
import { writeFile } from 'node:fs/promises'
import path from 'pathe'
import { afterEach, expect, it } from 'vitest'
import { findVersionCommit, verifySource } from '@/commands/release/lifecycle/identity'
import { cleanupReleaseTempRoots, createTempWorkspace } from '../release-fixtures'

afterEach(cleanupReleaseTempRoots)

it('finds the original version commit past later CI and manifest edits using real Git history', async () => {
  const cwd = await createTempWorkspace('main')
  const git = (...args: string[]) => {
    const result = spawnSync('git', args, { cwd, encoding: 'utf8', env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'Test',
      GIT_AUTHOR_EMAIL: 'test@example.invalid',
      GIT_COMMITTER_NAME: 'Test',
      GIT_COMMITTER_EMAIL: 'test@example.invalid',
    } })
    if (result.status !== 0) {
      throw new Error(result.stderr)
    }
    return result.stdout.trim()
  }
  git('init')
  git('add', '.')
  git('-c', 'commit.gpgsign=false', 'commit', '-m', 'initial')
  const manifest = path.join(cwd, 'packages/repoctl/package.json')
  const pkg = { name: 'repoctl', version: '1.0.1' }
  await writeFile(manifest, JSON.stringify(pkg))
  await writeFile(path.join(cwd, 'packages/repoctl/CHANGELOG.md'), '# 1.0.1\n\nFixed release.\n')
  git('add', '.')
  git('-c', 'commit.gpgsign=false', 'commit', '-m', 'version')
  const original = git('rev-parse', 'HEAD')
  await writeFile(manifest, JSON.stringify({ ...pkg, description: 'later edit' }))
  git('add', '.')
  git('-c', 'commit.gpgsign=false', 'commit', '-m', 'CI followup')
  expect(git('rev-parse', 'HEAD')).not.toBe(original)
  await expect(findVersionCommit(pkg, { cwd })).resolves.toBe(original)
  await expect(verifySource(pkg, original, { cwd })).resolves.toBeUndefined()
  await writeFile(path.join(cwd, 'packages/repoctl/CHANGELOG.md'), '# 1.0.1\n\nChanged later.\n')
  await expect(verifySource(pkg, original, { cwd })).rejects.toThrow('Changelog differs')
})
