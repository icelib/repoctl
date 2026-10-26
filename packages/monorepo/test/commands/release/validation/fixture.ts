import type { ReleasePreparationValidationOptions } from '@icebreakers/monorepo'
import { mkdir, readFile, rename } from 'node:fs/promises'
import path from 'node:path'
import crossSpawn from 'cross-spawn'
import { fixture as planFixture } from '../plan/fixture'
import { startRegistry } from '../plan/registry'

const diagnosticSpawn: NonNullable<ReleasePreparationValidationOptions['spawn']> = ((command, args, settings) => {
  const result = crossSpawn.sync(command, args ?? [], settings as Parameters<typeof crossSpawn.sync>[2])
  if (result.error || result.status !== 0) {
    throw new Error(`Release validation fixture command failed: ${JSON.stringify({
      command,
      args,
      cwd: settings?.cwd,
      status: result.status,
      signal: result.signal,
      error: result.error ? { ...result.error, name: result.error.name, message: result.error.message } : null,
      stdout: result.stdout?.toString(),
      stderr: result.stderr?.toString(),
    }, null, 2)}`)
  }
  return result
}) as NonNullable<ReleasePreparationValidationOptions['spawn']>

export async function fixture(options: { lane?: string, root?: boolean, dependencyRange?: string, malformedFixtures?: boolean, unpublishedConsumer?: boolean, publishAlias?: boolean, publishRegistry?: boolean } = {}) {
  const fixture = await planFixture()
  // Native pnpm 12 versioning reads PNPM_CONFIG_REGISTRY, not npm_config_registry.
  // Keep isolated replay and CLI children on the same fixture registry as preparation.
  const env = {
    ...fixture.env,
    PNPM_CONFIG_REGISTRY: fixture.env.npm_config_registry,
    // Hook children invoke pnpm without replay's flags; keep their launcher offline too.
    PNPM_CONFIG_PM_ON_FAIL: 'ignore',
    PNPM_CONFIG_RUNTIME_ON_FAIL: 'ignore',
    PNPM_CONFIG_MANAGE_PACKAGE_MANAGER_VERSIONS: 'false',
  }
  await mkdir(path.join(fixture.cwd, 'packages/nested'), { recursive: true })
  await rename(path.join(fixture.cwd, 'packages/consumer'), path.join(fixture.cwd, 'packages/nested/consumer'))
  if (options.dependencyRange || options.unpublishedConsumer || options.publishAlias) {
    const filename = 'packages/nested/consumer/package.json'
    const manifest = JSON.parse(await readFile(path.join(fixture.cwd, filename), 'utf8'))
    if (options.dependencyRange) {
      manifest.dependencies.a = options.dependencyRange
    }
    if (options.unpublishedConsumer) {
      manifest.name = 'unpublished-consumer'
    }
    if (options.publishAlias) {
      manifest.publishConfig = {
        name: 'consumer-published-alias',
        registry: options.publishRegistry ? await startRegistry(['consumer-published-alias']) : fixture.env.npm_config_registry,
        access: 'public',
        directory: 'dist',
      }
    }
    await fixture.write(filename, JSON.stringify(manifest))
  }
  if (options.publishAlias) {
    const filename = 'packages/b/package.json'
    const manifest = JSON.parse(await readFile(path.join(fixture.cwd, filename), 'utf8'))
    manifest.publishConfig = { access: 'public', directory: 'dist' }
    await fixture.write(filename, JSON.stringify(manifest))
  }
  await fixture.write('pnpm-workspace.yaml', [
    `packages: [packages/*, packages/nested/*${options.malformedFixtures ? ', "!packages/excluded"' : ''}]`,
    'versioning:',
    '  fixed: [[a, b]]',
    '  changelog: {storage: repository}',
    ...(options.lane ? [`  lanes: {a: ${options.lane}, b: ${options.lane}, consumer: ${options.lane}, private-lib: ${options.lane}}`] : []),
    '',
  ].join('\n'))
  if (options.malformedFixtures) {
    await fixture.write('fixtures/not-a-workspace/package.json', '{ malformed test input')
    await fixture.write('packages/excluded/package.json', '{ malformed excluded input')
  }
  for (const directory of ['a', 'b', 'nested/consumer', 'private-lib']) {
    await fixture.write(`packages/${directory}/CHANGELOG.md`, `# ${directory}\n\n## 1.0.0\n\nOriginal release.\n`)
  }
  if (options.root) {
    const manifest = JSON.parse(await readFile(path.join(fixture.cwd, 'package.json'), 'utf8'))
    await fixture.write('package.json', JSON.stringify({ ...manifest, name: 'root-pkg', version: '1.0.0' }))
    await fixture.write('.changeset/root.md', '---\nroot-pkg: patch\n---\nRoot tooling.\n')
  }
  fixture.git('add', '.')
  fixture.git('-c', 'commit.gpgsign=false', 'commit', '-qm', 'nested release metadata')
  const base = fixture.git('rev-parse', 'HEAD')
  function commit() {
    fixture.git('add', '.')
    fixture.git('-c', 'commit.gpgsign=false', 'commit', '-qm', 'prepared release')
    return fixture.git('rev-parse', 'HEAD')
  }
  function prepare() {
    diagnosticSpawn('pnpm', [
      '--config.pm-on-fail=ignore',
      '--config.runtime-on-fail=ignore',
      '--config.manage-package-manager-versions=false',
      '--config.ignore-pnpmfile=true',
      '--config.ignore-scripts=true',
      'version',
      '-r',
      '--no-git-checks',
      '--json',
    ], { cwd: fixture.cwd, env: { ...env, COREPACK_ENABLE_NETWORK: '0' }, encoding: 'utf8', timeout: 60000 })
    return commit()
  }
  return { ...fixture, env, base, prepare, commit, spawn: diagnosticSpawn }
}
