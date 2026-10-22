/* eslint test/no-import-node-test: off -- These deployment regressions run with node --test outside workspace Vitest projects. */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { it } from 'node:test'
import { fileURLToPath } from 'node:url'
import { loadMonorepoConfig, planDocsDeployment } from 'repoctl'

const root = fileURLToPath(new URL('../../', import.meta.url))

it('the source site ignores lock and source CI changes but blocks unpublished product inputs', async () => {
  const { commands: { docs } } = await loadMonorepoConfig(root)
  const site = docs.sites.website
  const cwd = await mkdtemp(path.join(tmpdir(), 'repoctl-site-inputs-'))
  const records = new Map()
  const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim()
  async function put(filename, value) {
    await mkdir(path.dirname(path.join(cwd, filename)), { recursive: true })
    await writeFile(path.join(cwd, filename), value)
  }
  function commit() {
    git('add', '.')
    git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', '-c', `core.hooksPath=${cwd}/no-hooks`, 'commit', '-qm', 'fixture')
    const sha = git('rev-parse', 'HEAD')
    git('update-ref', 'refs/remotes/origin/main', sha)
    return sha
  }
  async function plan(sourceSha, baseline) {
    const value = {
      schemaVersion: 1,
      repository: 'fixture/repoctl',
      branch: 'main',
      distTag: 'latest',
      sourceSha,
      packages: site.packages.map(name => ({ name, version: name === 'repoctl' ? '1.1.0' : '1.0.0', sourceSha: name === 'repoctl' ? sourceSha : baseline })),
      releasedPackages: ['repoctl'],
      checkpointKey: 'a'.repeat(64),
    }
    const id = createHash('sha256').update(JSON.stringify(value)).digest('hex')
    records.set(`releases/${id}`, { value: { ...value, id }, revision: id })
    return planDocsDeployment({
      cwd,
      site: 'website',
      channel: 'stable',
      release: id,
      config: docs,
      env: { GITHUB_REPOSITORY: 'fixture/repoctl' },
      github: {
        readAutomationState: async key => records.get(key),
        readBranchHead: async () => git('rev-parse', 'refs/remotes/origin/main'),
        writeAutomationState: async () => { throw new Error('Planning must not write remote state') },
      },
    })
  }
  try {
    git('init', '-q', '-b', 'main')
    await put('package.json', JSON.stringify({ name: 'fixture', private: true, packageManager: 'pnpm@12.13.0' }))
    await put('pnpm-workspace.yaml', 'packages:\n  - packages/*\n')
    await put('pnpm-lock.yaml', 'lockfileVersion: 9.0\n')
    for (const name of site.packages) {
      const directory = site.releaseInputs[name][0].replace(/\/\*\*$/u, '')
      await put(`${directory}/package.json`, JSON.stringify({ name, version: '1.0.0' }))
      await put(`${directory}/src/index.ts`, 'export const released = true\n')
    }
    const baseline = commit()
    await put('packages/repoctl/package.json', JSON.stringify({ name: 'repoctl', version: '1.1.0' }))
    await put('packages/repoctl/src/index.ts', 'export const released = "new stable feature"\n')
    await put('pnpm-lock.yaml', 'lockfileVersion: 9.0\n# changed by the partial release\n')
    const released = await plan(commit(), baseline)
    assert.equal(released.eligible, true, released.blockers.join('\n'))
    assert.equal(released.skipped, false)
    assert.equal(released.packages.find(pkg => pkg.name === '@icebreakers/monorepo').sourceSha, baseline)

    for (const filename of [
      '.github/pr-ci/admission.mjs',
      '.github/nightly/run.mjs',
      '.github/workflows/pr-ci.yml',
      '.github/workflows/pr-ci-manual.yml',
      '.github/workflows/devcontainer.yml',
      '.github/workflows/ci.yml',
      '.github/workflows/repoctl-docs.yml',
    ]) {
      await put(filename, '# source repository automation only\n')
    }
    const sourceCi = await plan(commit(), baseline)
    assert.equal(sourceCi.eligible, true, sourceCi.blockers.join('\n'))
    assert.deepEqual(sourceCi.blockers, [])

    await put('packages/monorepo/src/index.ts', 'export const unpublished = true\n')
    const unpublished = await plan(commit(), baseline)
    assert.equal(unpublished.eligible, false)
    assert.ok(unpublished.blockers.includes('Unpublished inputs for @icebreakers/monorepo: packages/monorepo/src/index.ts'))

    await put('packages/monorepo/src/index.ts', 'export const released = true\n')
    await put('pnpm-workspace.yaml', 'packages:\n  - packages/*\n# shipped workspace change\n')
    const workspace = await plan(commit(), baseline)
    assert.equal(workspace.eligible, false)
    assert.deepEqual(workspace.blockers, ['Unpublished inputs for @icebreakers/monorepo-templates: pnpm-workspace.yaml'])

    await put('pnpm-workspace.yaml', 'packages:\n  - packages/*\n')
    // Shared Release, metadata and consumer workflow assets still change the published template.
    for (const filename of [
      '.github/workflows/release.yml',
      '.github/ISSUE_TEMPLATE/bug.yml',
      'packages/monorepo/assets/.github/workflows/ci.yml',
    ]) {
      await put(filename, '# published automation or metadata\n')
      const publishedAsset = await plan(commit(), baseline)
      assert.equal(publishedAsset.eligible, false)
      assert.ok(publishedAsset.blockers.includes(`Unpublished inputs for @icebreakers/monorepo-templates: ${filename}`))
      await rm(path.join(cwd, filename))
    }
  }
  finally {
    await rm(cwd, { recursive: true, force: true })
  }
})
