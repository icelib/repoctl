import { spawnSync } from 'node:child_process'
import { copyFile, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import YAML from 'yaml'

const rootDir = fileURLToPath(new URL('../../../../', import.meta.url))
const fixtureRoots: string[] = []

async function fixture(version = '0.17.0', reviewedVersion: string | undefined = version) {
  const root = await mkdtemp(path.join(tmpdir(), 'repoctl-nimbus-review-'))
  fixtureRoots.push(root)
  const templateDir = path.join(root, 'templates/nimbus')
  const script = path.join(root, 'scripts/nimbus/check-upgrade.mjs')
  await mkdir(templateDir, { recursive: true })
  await mkdir(path.dirname(script), { recursive: true })
  await copyFile(path.join(rootDir, 'scripts/nimbus/check-upgrade.mjs'), script)
  await writeFile(path.join(templateDir, 'package.json'), JSON.stringify({ dependencies: { '@cloudflare/nimbus-docs': version } }))
  await writeFile(path.join(templateDir, 'nimbus.json'), JSON.stringify({ lastReviewedNimbusVersion: reviewedVersion }))
  const run = (entrypoint = script) => spawnSync(process.execPath, [entrypoint], {
    cwd: tmpdir(),
    env: { ...process.env, NODE_PATH: '', NODE_OPTIONS: '' },
    encoding: 'utf8',
  })
  return { root, script, templateDir, run }
}

afterEach(async () => {
  await Promise.all(fixtureRoots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

describe('Nimbus upgrade review gate', () => {
  it('runs without workspace dependencies and resolves the template independently of cwd', async () => {
    const h = await fixture()
    const result = h.run()
    expect(result.error).toBeUndefined()
    expect(result.status, result.stderr).toBe(0)
    expect(result.stdout).toContain('Nimbus upgrade review is current (0.17.0)')
    expect(result.stderr).toBe('')
  })

  it('blocks an unreviewed dependency upgrade without advancing its baseline', async () => {
    const h = await fixture('0.17.0', '0.16.0')
    const baseline = await readFile(path.join(h.templateDir, 'nimbus.json'), 'utf8')
    const result = h.run()
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('package.json pins 0.17.0')
    expect(result.stderr).toContain('last reviewed at 0.16.0')
    expect(result.stderr).toContain('pnpm install --frozen-lockfile --ignore-scripts')
    expect(result.stderr).toContain('nimbus-docs migrate --dry-run --json')
    expect(result.stderr).toContain('Do not advance lastReviewedNimbusVersion')
    expect(await readFile(path.join(h.templateDir, 'nimbus.json'), 'utf8')).toBe(baseline)
  })

  it('executes the gate when invoked through a directory symlink', async () => {
    const h = await fixture('0.17.0', '0.16.0')
    const linkedDir = path.join(h.root, 'linked-nimbus')
    await symlink(path.dirname(h.script), linkedDir, 'junction')
    const result = h.run(path.join(linkedDir, 'check-upgrade.mjs'))
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('Nimbus upgrade review is required')
  })

  it.each(['^0.17.0', '~0.17.0', 'latest', 'workspace:*', '0.17', '0.17.0_bad'])('rejects a non-exact dependency: %s', async (version) => {
    const result = (await fixture(version)).run()
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('must pin @cloudflare/nimbus-docs to an exact version')
  })

  it.each(['package.json', 'nimbus.json'])('reports a missing %s before installation', async (filename) => {
    const h = await fixture()
    await rm(path.join(h.templateDir, filename))
    const result = h.run()
    expect(result.status).toBe(1)
    expect(result.stderr).toContain(`Cannot read Nimbus ${filename}`)
    expect(result.stderr).toContain('nimbus-docs migrate --dry-run --json')
  })

  it.each(['package.json', 'nimbus.json'])('reports corrupt JSON in %s before installation', async (filename) => {
    const h = await fixture()
    await writeFile(path.join(h.templateDir, filename), '{ broken')
    const result = h.run()
    expect(result.status).toBe(1)
    expect(result.stderr).toContain(`Cannot read Nimbus ${filename}`)
  })

  it('rejects a missing review version', async () => {
    const h = await fixture()
    await writeFile(path.join(h.templateDir, 'nimbus.json'), '{}')
    const result = h.run()
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('must define an exact lastReviewedNimbusVersion')
  })
})

describe('Nimbus update policy', () => {
  it.each(['minor', 'patch', 'major'])('isolates %s updates from automatic merging while retaining the release delay', async (updateType) => {
    const renovate = JSON.parse(await readFile(path.join(rootDir, 'renovate.json'), 'utf8'))
    const matching = renovate.packageRules.filter((rule: { matchManagers?: string[], matchPackageNames?: string[], matchUpdateTypes?: string[] }) =>
      (!rule.matchManagers || rule.matchManagers.includes('npm'))
      && (!rule.matchPackageNames || rule.matchPackageNames.includes('@cloudflare/nimbus-docs'))
      && (!rule.matchUpdateTypes || rule.matchUpdateTypes.includes(updateType)),
    )
    const effective = Object.assign({}, renovate, ...matching)
    expect(effective.automerge).toBe(false)
    expect(effective.groupName).toBe('Nimbus documentation engine')
    expect(effective.groupSlug).toBe('nimbus-documentation-engine')
    expect(effective.minimumReleaseAge).toBe('7 days')
    expect(effective.internalChecksFilter).toBe('strict')
  })

  it.each([
    { workflow: 'ci', job: 'build' },
    { workflow: 'devcontainer', job: 'devcontainer' },
  ])('requires review before dependency installation in $workflow', async ({ workflow, job }) => {
    const source = await readFile(path.join(rootDir, `.github/workflows/${workflow}.yml`), 'utf8')
    const jobConfig = YAML.parse(source).jobs[job]
    const steps = jobConfig.steps as { 'run'?: string, 'uses'?: string, 'if'?: string, 'continue-on-error'?: boolean }[]
    const reviews = steps.filter(step => step.run === 'pnpm check:nimbus-upgrade')
    expect(reviews).toHaveLength(1)
    expect(steps.indexOf(reviews[0]!)).toBeGreaterThan(steps.findIndex(step => step.uses?.startsWith('actions/setup-node@')))
    expect(steps.indexOf(reviews[0]!)).toBeLessThan(steps.findIndex(step => step.run === 'pnpm install --frozen-lockfile'))
    expect(reviews[0]!.if).toBeUndefined()
    expect(reviews[0]!['continue-on-error']).toBeUndefined()
    expect(jobConfig['continue-on-error']).toBeUndefined()
  })
})
