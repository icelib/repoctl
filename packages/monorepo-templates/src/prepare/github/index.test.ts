import { access, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'
import YAML from 'yaml'
import { arePublishedGithubAssetsPrepared, preparePublishedGithubAssets } from './index'

async function outputFile(filename: string, content: string) {
  await mkdir(path.dirname(filename), { recursive: true })
  await writeFile(filename, content)
}

async function createFixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'repoctl-consumer-workflows-'))
  const assets = path.join(root, 'prepared-assets')
  const consumerRoot = path.join(root, 'packages/monorepo/assets/.github/workflows')
  await Promise.all([
    outputFile(path.join(root, '.github/workflows/ci.yml'), 'on: [workflow_call]\njobs: {}\n'),
    outputFile(path.join(root, '.github/workflows/pr-ci.yml'), 'on: [pull_request_target]\njobs: {}\n'),
    outputFile(path.join(root, '.github/workflows/devcontainer.yml'), 'on: [workflow_call]\njobs: {}\n'),
    outputFile(path.join(root, '.github/workflows/release.yml'), 'on: [push]\njobs: {}\n'),
    outputFile(path.join(root, '.github/pr-ci/index.mjs'), 'throw new Error("Source-only approval tooling")\n'),
    outputFile(path.join(root, '.github/auto-changeset/index.mjs'), 'console.log("Shared changeset tooling")\n'),
    outputFile(path.join(root, '.github/FUNDING.yml'), 'github: sonofmagic\n'),
    outputFile(path.join(consumerRoot, 'ci.yml'), 'on: [pull_request]\njobs:\n  test:\n    steps:\n      - run: pnpm check:workflows\n      - run: pnpm test\n'),
    outputFile(path.join(consumerRoot, 'release-intent-auto.yml'), 'on: [pull_request_target]\njobs: {}\n'),
    outputFile(path.join(consumerRoot, 'release-intent-check.yml'), 'on: [pull_request]\njobs: {}\n'),
    outputFile(path.join(assets, '.github/workflows/ci.yml'), 'on: [workflow_call]\njobs: {}\n'),
    outputFile(path.join(assets, '.github/workflows/pr-ci.yml'), 'stale source approval workflow\n'),
    outputFile(path.join(assets, '.github/workflows/devcontainer.yml'), 'stale source devcontainer workflow\n'),
    outputFile(path.join(assets, '.github/pr-ci/index.mjs'), 'stale source-only tooling\n'),
  ])
  return { root, assets }
}

it.each([true, false])('publishes automatic consumer workflows and removes source approval assets (overwrite=%s)', async (overwrite) => {
  const fixture = await createFixture()
  try {
    expect(await arePublishedGithubAssetsPrepared(fixture.root, fixture.assets)).toBe(false)
    await preparePublishedGithubAssets(fixture.root, fixture.assets, overwrite)
    const github = path.join(fixture.assets, '.github')
    expect((await readdir(path.join(github, 'workflows'))).sort()).toEqual([
      'ci.yml',
      'release-intent-auto.yml',
      'release-intent-check.yml',
      'release.yml',
    ])
    const ci = YAML.parse(await readFile(path.join(github, 'workflows/ci.yml'), 'utf8'))
    expect(ci.on).toEqual(['pull_request'])
    expect(ci.jobs.test.steps).toEqual([{ run: 'pnpm test' }])
    expect(await readFile(path.join(github, 'auto-changeset/index.mjs'), 'utf8')).toContain('Shared changeset tooling')
    expect(await readFile(path.join(github, 'FUNDING.yml'), 'utf8')).toBe('github: sonofmagic\n')
    expect(YAML.parse(await readFile(path.join(github, 'workflows/release.yml'), 'utf8')).on).toEqual(['push'])
    await expect(access(path.join(github, 'pr-ci'))).rejects.toMatchObject({ code: 'ENOENT' })
    expect(await arePublishedGithubAssetsPrepared(fixture.root, fixture.assets)).toBe(true)

    await writeFile(path.join(fixture.root, '.github/workflows/release.yml'), YAML.stringify({
      on: ['push'],
      permissions: { contents: 'write', actions: 'write' },
      jobs: { release: { steps: [
        { id: 'release-prepare', run: 'pnpm exec repo release ci --stage prepare' },
        { id: 'pr-ci-approval', run: 'node .github/pr-ci/index.mjs release' },
      ] } },
    }))
    expect(await arePublishedGithubAssetsPrepared(fixture.root, fixture.assets)).toBe(false)
    await preparePublishedGithubAssets(fixture.root, fixture.assets, false)
    const release = YAML.parse(await readFile(path.join(github, 'workflows/release.yml'), 'utf8'))
    expect(release.permissions).toEqual({ contents: 'write' })
    expect(release.jobs.release.steps).toEqual([{ id: 'release-prepare', run: 'pnpm exec repo release ci --stage prepare' }])
    expect(await arePublishedGithubAssetsPrepared(fixture.root, fixture.assets)).toBe(true)

    await outputFile(path.join(github, 'pr-ci/index.mjs'), 'stale approval tooling\n')
    expect(await arePublishedGithubAssetsPrepared(fixture.root, fixture.assets)).toBe(false)
    await preparePublishedGithubAssets(fixture.root, fixture.assets, false)
    await writeFile(path.join(github, 'workflows/release-intent-check.yml'), 'on: [workflow_call]\njobs: {}\n')
    expect(await arePublishedGithubAssetsPrepared(fixture.root, fixture.assets)).toBe(false)
  }
  finally {
    await rm(fixture.root, { recursive: true, force: true })
  }
})

it('keeps independently maintained consumer definitions automatic and approval-free', async () => {
  const sourceRoot = fileURLToPath(new URL('../../../../monorepo/assets/.github/workflows/', import.meta.url))
  for (const [filename, event] of [
    ['ci.yml', 'pull_request'],
    ['release-intent-auto.yml', 'pull_request_target'],
    ['release-intent-check.yml', 'pull_request'],
  ] as const) {
    const source = await readFile(path.join(sourceRoot, filename), 'utf8')
    const workflow = YAML.parse(source)
    expect(workflow.on[event]).toBeDefined()
    expect(workflow.on.workflow_call).toBeUndefined()
    expect(source).not.toContain('pr-ci')
    for (const job of Object.values(workflow.jobs) as { environment?: unknown }[]) {
      expect(job.environment).toBeUndefined()
    }
  }
})
