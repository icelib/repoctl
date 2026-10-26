import { mkdir, readFile, rename } from 'node:fs/promises'
import path from 'node:path'
import crossSpawn from 'cross-spawn'
import { fixture as planFixture } from '../plan/fixture'
import { startRegistry } from '../plan/registry'

export async function fixture(options: { lane?: string, root?: boolean, dependencyRange?: string, malformedFixtures?: boolean, unpublishedConsumer?: boolean, publishAlias?: boolean, publishRegistry?: boolean } = {}) {
  const fixture = await planFixture()
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
    const result = crossSpawn.sync('pnpm', [
      '--config.pm-on-fail=ignore',
      '--config.runtime-on-fail=ignore',
      '--config.manage-package-manager-versions=false',
      '--config.ignore-pnpmfile=true',
      '--config.ignore-scripts=true',
      'version',
      '-r',
      '--no-git-checks',
      '--json',
    ], { cwd: fixture.cwd, env: { ...fixture.env, COREPACK_ENABLE_NETWORK: '0' }, encoding: 'utf8', timeout: 60000 })
    if (result.status !== 0) {
      throw new Error(result.stderr || result.stdout)
    }
    return commit()
  }
  return { ...fixture, base, prepare, commit }
}
