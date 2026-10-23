import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'

it.each([['Invalid!secret-token', 'stable'], ['website', 'invalid']])('keeps built CLI failure stdout valid JSON for %s / %s without network access', (site, channel) => {
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('../../bin/repo.js', import.meta.url)), 'docs', 'deploy', site, '--channel', channel, '--json'], {
    cwd: tmpdir(),
    encoding: 'utf8',
    timeout: 30_000,
    env: { ...process.env, GITHUB_REPOSITORY: 'example/fixture', GITHUB_TOKEN: 'secret-token', GITHUB_STEP_SUMMARY: '', NO_COLOR: '1' },
  })
  expect(result.status).toBe(1)
  expect(result.error).toBeUndefined()
  expect(JSON.parse(result.stdout)).toMatchObject({ schemaVersion: 1, status: 'failed', failedStage: 'plan' })
  expect(`${result.stdout}${result.stderr}`).not.toMatch(/secret-token|DocsDeploymentError|\bat file:/)
  expect(result.stderr).toBe('')
})
