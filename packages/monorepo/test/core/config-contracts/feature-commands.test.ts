import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { checkEnvironmentCache, explainMonorepoConfig, loadMonorepoConfigDetails, resolveCommandValues, validateConfigFile, validateMonorepoConfig } from '@icebreakers/monorepo'
import { expect, it } from 'vitest'
import { fixture, invoke } from './fixtures'

const commands = {
  env: {
    tasks: ['build', 'test'],
    include: ['src/**'],
    exclude: ['generated/**'],
    frameworkInference: false,
    suppressions: [{ rule: 'env-missing', reason: 'Reviewed by the team', package: '@team/app', task: 'build', variable: 'PUBLIC_*', path: 'packages/app/**' }],
  },
  release: {
    branches: {
      stable: 'main',
      maintenance: [{ branch: 'support/1.x', range: '1.x', tag: 'legacy' }],
      prerelease: [{ branch: 'preview', lane: 'beta', tag: 'preview', target: 'support/1.x' }],
    },
  },
}

it('loads and inspects environment and release-line options through the built config contract', async () => {
  const cwd = await fixture(`export default ${JSON.stringify({ commands })}`)
  expect(await validateConfigFile(cwd)).toMatchObject({ valid: true, diagnostics: [] })
  expect((await loadMonorepoConfigDetails(cwd)).config.commands).toMatchObject(commands)
  for (const name of ['env', 'release'] as const) {
    const result = invoke(cwd, ['config', 'inspect', '--command', name, '--json'])
    expect(result.status, result.stderr).toBe(0)
    expect(JSON.parse(result.stdout).effective.values).toMatchObject(commands[name])
  }
})

it('preserves environment defaults and explicit overrides while replacing release branch lists', () => {
  expect(resolveCommandValues('env')).toMatchObject({ values: { tasks: ['build'], frameworkInference: true }, origins: { tasks: 'default', frameworkInference: 'default' } })
  expect(resolveCommandValues('env', commands.env, { tasks: ['lint'], frameworkInference: true })).toMatchObject({
    values: { ...commands.env, tasks: ['lint'], frameworkInference: true },
    origins: { tasks: 'cli', frameworkInference: 'cli', include: 'project' },
  })
  expect(resolveCommandValues('release', commands.release, { branches: { prerelease: [] } }).values.branches).toEqual({ ...commands.release.branches, prerelease: [] })
  expect(commands.release.branches.prerelease).toHaveLength(1)
})

it.each([
  [{ env: { frameworkInference: 'yes' } }, 'commands.env.frameworkInference'],
  [{ env: { suppressions: [{ rule: 'env-missing' }] } }, 'commands.env.suppressions[0].reason'],
  [{ env: { suppressions: [{ rule: 'env-missing', reason: 'Reviewed', typo: 'private-value' }] } }, 'commands.env.suppressions[0].typo'],
  [{ release: { branches: { stable: false } } }, 'commands.release.branches.stable'],
  [{ release: { branches: { maintenance: [{ branch: '1.x', range: '1.x' }] } } }, 'commands.release.branches.maintenance[0].tag'],
  [{ release: { branches: { prerelease: [{ branch: 'preview', lane: 'beta', tag: 'preview', typo: 'private-value' }] } } }, 'commands.release.branches.prerelease[0].typo'],
])('rejects malformed newly integrated command fields without exposing their values', (value, expectedPath) => {
  const diagnostics = validateMonorepoConfig({ commands: value })
  expect(diagnostics.map(item => item.path)).toContain(expectedPath)
  expect(JSON.stringify(diagnostics)).not.toContain('private-value')
})

it('explains root environment settings from a package directory just as the scan executes them', async () => {
  const cwd = await fixture(`export default ${JSON.stringify({ commands: { env: { tasks: ['test'], frameworkInference: false } } })}`)
  const child = path.join(cwd, 'packages/app')
  await mkdir(child, { recursive: true })
  await writeFile(path.join(cwd, 'package.json'), JSON.stringify({ name: 'root', private: true, packageManager: 'pnpm@11.6.0' }))
  await writeFile(path.join(cwd, 'pnpm-workspace.yaml'), 'packages: [packages/*]\n')
  await writeFile(path.join(cwd, 'turbo.json'), JSON.stringify({ tasks: { test: {} } }))
  await writeFile(path.join(child, 'package.json'), JSON.stringify({ name: '@team/app', private: true, scripts: { test: 'node -e "process.exit(0)"' } }))
  await writeFile(path.join(child, 'repoctl.config.mjs'), 'export default { commands: { env: { tasks: ["build"], frameworkInference: true } } }')
  const explained = await explainMonorepoConfig(child, { command: 'env' })
  expect(explained.effective).toMatchObject({ values: { tasks: ['test'], frameworkInference: false }, origins: { tasks: 'project', frameworkInference: 'project' } })
  const scanned = await checkEnvironmentCache(child)
  expect(scanned.status).toBe('pass')
  expect(scanned.tasks.map(item => [item.package, item.task])).toEqual([['@team/app', 'test']])
})
