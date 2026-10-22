import { planDocsDeployment } from '@icebreakers/monorepo'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, commit, fixture, git, makeRecord, put } from './helpers'

afterEach(cleanup)

describe('built documentation publication planner', () => {
  it('uses the complete published source when main has newer code and pending intents', async () => {
    const { cwd, sha, options, store } = await fixture()
    await put(cwd, 'packages/core/src/index.ts', 'export const value = "unreleased"\n')
    await put(cwd, '.changeset/new.md', '---\ncore: minor\n---\nUnreleased feature.\n')
    const main = commit(cwd)
    const before = git(cwd, 'status', '--porcelain')
    const plan = await planDocsDeployment(options)
    expect(plan).toMatchObject({ eligible: true, skipped: false, sourceSha: sha, blockers: [] })
    expect(plan.packages.map(pkg => pkg.name)).toEqual(['core', 'runtime'])
    expect(store.writes).toEqual([])
    expect(git(cwd, 'rev-parse', 'HEAD')).toBe(main)
    expect(git(cwd, 'status', '--porcelain')).toBe(before)
  })

  it('refuses arbitrary stable sources and missing completion records', async () => {
    const { options, sha } = await fixture()
    await expect(planDocsDeployment({ ...options, sourceSha: sha })).rejects.toThrow('never an arbitrary')
    await expect(planDocsDeployment({ ...options, release: 'b'.repeat(64) })).rejects.toThrow('record is missing')
  })

  it('does not deploy a site for an unrelated package release', async () => {
    const { options, store, sha } = await fixture()
    const record = makeRecord(sha, { packages: [...makeRecord(sha).packages, { name: 'other', version: '1.0.0', sourceSha: sha }], releasedPackages: ['other'] })
    await store.github.writeAutomationState(`releases/${record.id}`, record)
    expect(await planDocsDeployment({ ...options, release: record.id })).toMatchObject({ eligible: true, skipped: true })
  })

  it('includes a runtime dependency publication even when the documented package is unchanged', async () => {
    const { options, store, sha } = await fixture()
    const record = makeRecord(sha, { releasedPackages: ['runtime'] })
    await store.github.writeAutomationState(`releases/${record.id}`, record)
    expect(await planDocsDeployment({ ...options, release: record.id })).toMatchObject({ eligible: true, skipped: false })
  })

  it('skips unrelated releases even when site packages have no publication proof or pending inputs', async () => {
    const { cwd, options, store } = await fixture()
    await put(cwd, '.changeset/core.md', '---\ncore: minor\n---\nPending product.\n')
    const sourceSha = commit(cwd)
    const record = makeRecord(sourceSha, { packages: [{ name: 'other', version: '1.0.0', sourceSha }], releasedPackages: ['other'] })
    await store.github.writeAutomationState(`releases/${record.id}`, record)
    expect(await planDocsDeployment({ ...options, release: record.id })).toMatchObject({ eligible: true, skipped: true, blockers: [] })
  })

  it('detects unpublished dependency contents even when its version exists in npm', async () => {
    const { cwd, options, store, sha } = await fixture()
    await put(cwd, 'packages/runtime/src/index.ts', 'export const unreleased = true\n')
    const sourceSha = commit(cwd)
    const record = makeRecord(sourceSha, { packages: [{ name: 'core', version: '1.0.0', sourceSha }, { name: 'runtime', version: '1.0.0', sourceSha: sha }], releasedPackages: ['core'] })
    await store.github.writeAutomationState(`releases/${record.id}`, record)
    const plan = await planDocsDeployment({ ...options, release: record.id })
    expect(plan.eligible).toBe(false)
    expect(plan.blockers.join('\n')).toContain('Unpublished inputs for runtime: packages/runtime/src/index.ts')
  })

  it('checks pending intents in the frozen source and shared configured build inputs', async () => {
    const { cwd, options, store, sha } = await fixture()
    await put(cwd, 'shared/compiler.ts', 'export const changed = true\n')
    await put(cwd, '.changeset/runtime.md', '---\nruntime: patch\n---\nPending runtime.\n')
    const sourceSha = commit(cwd)
    const record = makeRecord(sourceSha, { packages: [{ name: 'core', version: '1.0.0', sourceSha }, { name: 'runtime', version: '1.0.0', sourceSha: sha }], releasedPackages: ['core'] })
    await store.github.writeAutomationState(`releases/${record.id}`, record)
    options.config!.sites!['website']!.releaseInputs = { runtime: ['packages/runtime/src/**', 'shared/**'] }
    const plan = await planDocsDeployment({ ...options, release: record.id })
    expect(plan.blockers.some(message => message.includes('Unconsumed release intent for runtime'))).toBe(true)
    expect(plan.blockers.some(message => message.includes('shared/compiler.ts'))).toBe(true)
  })

  it('isolates preview and rejects stable corrections on that channel', async () => {
    const { options, sha } = await fixture()
    const { release: _release, ...preview } = options
    expect(await planDocsDeployment({ ...preview, channel: 'preview', sourceSha: sha })).toMatchObject({ eligible: true, packages: [], sourceSha: sha })
    await expect(planDocsDeployment({ ...options, channel: 'preview', sourceSha: sha })).rejects.toThrow('Preview only accepts')
  })

  it('validates configuration before any build or publication', async () => {
    const { options } = await fixture()
    options.config!.sites!['website']!.releaseInputs = { core: ['../outside/**'] }
    await expect(planDocsDeployment(options)).rejects.toThrow('without path traversal')
  })
})
