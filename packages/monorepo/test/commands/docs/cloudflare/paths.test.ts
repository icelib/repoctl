import { existsSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { deployDocs, planDocsDeployment } from '@icebreakers/monorepo'
import { afterEach, expect, it } from 'vitest'
import { cleanup, commit, expectDocsFailure, makeRecord } from '../helpers'
import { nativeFixture, wrangler } from './helpers'

const external: string[] = []
afterEach(async () => {
  await cleanup()
  await Promise.all(external.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
})

async function outside() {
  const directory = await mkdtemp(path.join(tmpdir(), 'repoctl-docs-outside-'))
  external.push(directory)
  return directory
}

it('rejects assets path traversal before installing or building', async () => {
  const h = await nativeFixture({ ...wrangler, assets: { directory: '../../outside' } })
  await expectDocsFailure(deployDocs(h.options), 'preflight', 'artifact-path-invalid')
  expect(h.calls).toEqual([])
})

it.each(['config', 'output', 'dangling'])('rejects a preexisting external %s symlink before effects', async (kind) => {
  const h = await nativeFixture()
  const directory = await outside()
  if (kind === 'config') {
    writeFileSync(path.join(directory, 'wrangler.jsonc'), JSON.stringify(wrangler))
    rmSync(path.join(h.cwd, 'website/wrangler.jsonc'))
    symlinkSync(path.join(directory, 'wrangler.jsonc'), path.join(h.cwd, 'website/wrangler.jsonc'))
  }
  else {
    symlinkSync(kind === 'dangling' ? path.join(directory, 'missing') : directory, path.join(h.cwd, 'website/dist'), 'dir')
  }
  const record = makeRecord(commit(h.cwd))
  await h.store.github.writeAutomationState(`releases/${record.id}`, record)
  await expect(deployDocs({ ...h.options, release: record.id })).rejects.toThrow()
  expect(h.calls).toEqual([])
  expect(existsSync(path.join(directory, '.well-known'))).toBe(false)
})

it.each(['output', 'manifest-parent', 'manifest-file'])('rejects a build-created external %s symlink before manifest writes', async (kind) => {
  const h = await nativeFixture()
  const directory = await outside()
  h.callback.spawn = (args, source) => {
    if (args[1] !== 'docs:build') {
      return
    }
    const output = path.join(source, 'website/dist')
    if (kind === 'output') {
      rmSync(output, { recursive: true })
      symlinkSync(directory, output, 'dir')
    }
    else if (kind === 'manifest-parent') {
      symlinkSync(directory, path.join(output, '.well-known'), 'dir')
    }
    else {
      mkdirSync(path.join(output, '.well-known'))
      writeFileSync(path.join(directory, 'repoctl-deployment.json'), 'user-owned')
      symlinkSync(path.join(directory, 'repoctl-deployment.json'), path.join(output, '.well-known/repoctl-deployment.json'))
    }
  }
  await expectDocsFailure(deployDocs(h.options), 'provider', 'artifact-path-invalid')
  expect(h.state.uploadCount).toBe(0)
  expect(h.store.records.get('docs/website/stable')!.value).not.toHaveProperty('pending')
  expect(existsSync(path.join(directory, '.well-known'))).toBe(false)
})

it.each(['malformed', 'user', 'different', 'same'])('handles an existing %s manifest without overwriting unrelated output', async (kind) => {
  const h = await nativeFixture()
  const plan = await planDocsDeployment(h.options)
  const expected = { schemaVersion: 1, site: plan.site, channel: plan.channel, deploymentId: plan.deploymentId, sourceSha: plan.sourceSha, treeSha: plan.treeSha, releaseId: plan.releaseId }
  h.callback.spawn = (args, source) => {
    if (args[1] === 'docs:build') {
      const directory = path.join(source, 'website/dist/.well-known')
      mkdirSync(directory)
      const contents = kind === 'malformed' ? '{broken' : JSON.stringify(kind === 'user' ? { owned: 'by user' } : kind === 'different' ? { ...expected, treeSha: 'f'.repeat(40) } : expected)
      writeFileSync(path.join(directory, 'repoctl-deployment.json'), contents)
    }
  }
  if (kind === 'same') {
    expect((await deployDocs(h.options)).status).toBe('deployed')
    expect(h.state.manifest).toEqual(expected)
  }
  else {
    await expectDocsFailure(deployDocs(h.options), 'provider', 'manifest-conflict')
    expect(h.state.uploadCount).toBe(0)
    expect(h.store.records.get('docs/website/stable')!.value).not.toHaveProperty('pending')
  }
})
