import type { DocsOptions } from '@icebreakers/monorepo'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { deployDocs, planDocsDeployment } from '@icebreakers/monorepo'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, commit, expectDocsFailure, fixture, makeRecord, put } from './helpers'

afterEach(cleanup)

function runner(callback?: (args: string[], cwd: string, env: NodeJS.ProcessEnv) => void) {
  const calls: string[][] = []
  const spawn = vi.fn((command: string, args: string[], options: { cwd: string, env: NodeJS.ProcessEnv }) => {
    calls.push([command, ...args])
    callback?.(args, options.cwd, options.env)
    if (args[1] === 'docs:stable' || args[1] === 'docs:preview') {
      writeFileSync(options.env['REPO_DOCS_RESULT_FILE']!, JSON.stringify({ versionId: 'worker-version', url: 'https://docs.example.invalid' }))
    }
    return { status: 0, stdout: '', stderr: '' }
  }) as unknown as NonNullable<DocsOptions['spawn']>
  return { spawn, calls }
}

describe('built documentation deployer', () => {
  it('builds the full stable checkout, records the provider version and skips duplicate deployment', async () => {
    const { cwd, options, store } = await fixture()
    await put(cwd, 'packages/core/src/index.ts', 'export const value = "unreleased"\n')
    commit(cwd)
    const process = runner((args, source, env) => {
      expect(source).not.toBe(cwd)
      expect(readFileSync(path.join(source, 'packages/core/src/index.ts'), 'utf8')).toContain('"released"')
      if (args[0] === 'install') {
        expect(Object.keys(env).filter(key => key.startsWith('REPO_DOCS_'))).toEqual([])
      }
      else {
        expect(env['REPO_DOCS_CHANNEL']).toBe('stable')
        expect(env['REPO_DOCS_RELEASE_ID']).toBe(options.release)
        expect(env['REPO_DOCS_TREE_SHA']).toMatch(/^[a-f0-9]{40}$/)
      }
      if (args[1] === 'docs:stable') {
        const state = store.records.get('docs/website/stable')!.value as { pending: { phase: string } }
        expect(state.pending.phase).toBe('deploying')
      }
    })
    const result = await deployDocs({ ...options, spawn: process.spawn })
    expect(result).toMatchObject({ status: 'deployed', versionId: 'worker-version' })
    expect(process.calls).toEqual([
      ['pnpm', 'install', '--frozen-lockfile'],
      ['pnpm', 'run', 'docs:build'],
      ['pnpm', 'run', 'docs:stable'],
    ])
    expect((await deployDocs({ ...options, spawn: process.spawn })).status).toBe('skipped')
    expect(process.calls).toHaveLength(3)
  })

  it('rejects local production deployment before running any scripts', async () => {
    const { options } = await fixture()
    const process = runner()
    await expectDocsFailure(deployDocs({ ...options, env: { GITHUB_REPOSITORY: 'example/project' }, spawn: process.spawn }), 'preflight', 'workflow-required')
    expect(process.calls).toEqual([])
  })

  it('preserves the old pointer when build fails and permits an independent retry', async () => {
    const { options, store } = await fixture()
    const process = runner((args) => {
      if (args[1] === 'docs:build') {
        throw new Error('site build failed')
      }
    })
    await expect(deployDocs({ ...options, spawn: process.spawn })).rejects.toMatchObject({ report: { failedStage: 'build' } })
    expect(store.records.get('docs/website/stable')!.value).not.toHaveProperty('pending')
    expect(store.records.get('docs/website/stable')!.value).not.toHaveProperty('current')
    expect((await deployDocs({ ...options, spawn: runner().spawn })).status).toBe('deployed')
  })

  it('retains an unknown provider outcome and reconciles the same deployment without npm publish', async () => {
    const { options, store } = await fixture()
    const failed = runner((args) => {
      if (args[1] === 'docs:stable') {
        throw new Error('provider connection lost')
      }
    })
    await expect(deployDocs({ ...options, spawn: failed.spawn })).rejects.toMatchObject({ report: { failedStage: 'provider' } })
    expect(store.records.get('docs/website/stable')!.value).toHaveProperty('pending.phase', 'deploying')
    const failedRebuild = runner((args) => {
      if (args[1] === 'docs:build') {
        throw new Error('rebuild failed')
      }
    })
    await expect(deployDocs({ ...options, spawn: failedRebuild.spawn })).rejects.toMatchObject({ report: { failedStage: 'build' } })
    expect(store.records.get('docs/website/stable')!.value).toHaveProperty('pending.phase', 'deploying')
    const retry = runner()
    expect((await deployDocs({ ...options, spawn: retry.spawn, env: { ...options.env, GITHUB_RUN_ID: '124' } })).status).toBe('deployed')
    expect(retry.calls.every(call => !call.includes('publish'))).toBe(true)
  })

  it('refuses an older release after a newer snapshot was deployed', async () => {
    const { options, cwd, store } = await fixture()
    await deployDocs({ ...options, spawn: runner().spawn })
    await put(cwd, 'website/guide.md', '# Released guide\n')
    const sourceSha = commit(cwd)
    const record = makeRecord(sourceSha)
    await store.github.writeAutomationState(`releases/${record.id}`, record)
    await deployDocs({ ...options, release: record.id, spawn: runner().spawn })
    const older = runner()
    await expectDocsFailure(deployDocs({ ...options, spawn: older.spawn }), 'plan', 'plan-blocked')
    expect(older.calls).toEqual([])
  })

  it('does not upload after main advances during a preview build', async () => {
    const { options, sha, store } = await fixture()
    const { release: _release, ...preview } = options
    store.github.readBranchHead = async () => 'f'.repeat(40)
    const process = runner()
    await expectDocsFailure(deployDocs({ ...preview, channel: 'preview', sourceSha: sha, spawn: process.spawn }), 'provider', 'main-advanced')
    expect(process.calls.some(call => call.includes('docs:preview'))).toBe(false)
    expect(store.records.has('docs/website/stable')).toBe(false)
  })

  it('claims before building and rejects a competing revision before provider upload', async () => {
    const { options, store } = await fixture()
    const process = runner((args) => {
      if (args[1] === 'docs:build') {
        const current = store.records.get('docs/website/stable')!
        store.records.set('docs/website/stable', { ...current, revision: 'concurrent' })
      }
    })
    await expectDocsFailure(deployDocs({ ...options, spawn: process.spawn }), 'provider', 'claim-changed')
    expect(process.calls.some(call => call.includes('docs:stable'))).toBe(false)
    const plan = await planDocsDeployment(options)
    expect(plan.baseRevision).toBe('concurrent')
  })
})
