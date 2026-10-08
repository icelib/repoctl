import { describe, expect, it } from 'vitest'
import { syncNpmMirror } from '../../../../src/commands/release/npmmirror'
import { harness, packument } from './fixture'

const options = { cwd: '.', packageName: 'repoctl', version: '1.0.0' }

describe('npmmirror sync completion', () => {
  it('waits for queue processing, version propagation and dist-tag propagation', async () => {
    const tasks = ['processing', 'success']
    let mirrorQueries = 0
    const h = harness((url, init) => {
      if (init.method === 'PUT') {
        return Response.json({ ok: true, id: 'queued', state: 'waiting' })
      }
      if (url.includes('/syncs/')) {
        return Response.json({ ok: true, id: 'queued', state: tasks.shift() })
      }
      if (url.startsWith('https://registry.npmmirror.com')) {
        mirrorQueries++
        return Response.json(mirrorQueries === 1
          ? { 'versions': {}, 'dist-tags': {} }
          : mirrorQueries === 2
            ? { ...packument, 'dist-tags': { latest: '0.9.0' } }
            : packument)
      }
      return Response.json(packument)
    })
    expect(await syncNpmMirror(options, h.runtime)).toMatchObject([{ state: 'success', taskId: 'queued' }])
    expect(mirrorQueries).toBe(3)
    expect(h.elapsed()).toBe(40_000)
    expect(h.fetch.mock.calls.filter(([, init]) => init?.method === 'PUT')).toHaveLength(1)
  })

  it('waits when the public mirror returns 404 after task success', async () => {
    let mirrors = 0
    const h = harness(url => url.includes('/syncs')
      ? Response.json({ ok: true, id: 'task', state: 'success' })
      : url.startsWith('https://registry.npmmirror.com') && mirrors++ === 0
        ? Response.json({ error: 'not found' }, { status: 404 })
        : Response.json(packument))
    expect(await syncNpmMirror(options, h.runtime)).toMatchObject([{ state: 'success' }])
    expect(h.elapsed()).toBe(10_000)
  })

  it('uses current upstream tags when another release advances latest', async () => {
    let reads = 0
    const h = harness((url) => {
      if (url.includes('/syncs')) {
        return Response.json({ ok: true, id: 'task', state: 'success' })
      }
      if (url.startsWith('https://registry.npmjs.org') && reads++ > 0) {
        return Response.json({ ...packument, 'dist-tags': { latest: '2.0.0-next.0' } })
      }
      return Response.json({ ...packument, 'dist-tags': { latest: '2.0.0-next.0' } })
    })
    expect(await syncNpmMirror(options, h.runtime)).toMatchObject([{ state: 'success' }])
  })

  it('never submits a task during dry-run', async () => {
    const h = harness()
    expect(await syncNpmMirror({ ...options, dryRun: true }, h.runtime)).toMatchObject([{ state: 'dry-run' }])
    expect(h.fetch.mock.calls.every(([, init]) => init?.method !== 'PUT')).toBe(true)
  })

  it('refuses an unpublished version before creating a task', async () => {
    const h = harness()
    expect(await syncNpmMirror({ ...options, version: '9.0.0' }, h.runtime)).toMatchObject([{ state: 'failed', error: expect.stringContaining('not published') }])
    expect(h.fetch.mock.calls.every(([, init]) => init?.method !== 'PUT')).toBe(true)
  })

  it.each(['waiting', 'success'])('bounds the entire run while %s never becomes visible', async (state) => {
    const h = harness(url => url.includes('/syncs')
      ? Response.json({ ok: true, id: 'slow', state })
      : url.startsWith('https://registry.npmmirror.com')
        ? Response.json({ 'versions': {}, 'dist-tags': {} })
        : Response.json(packument))
    expect(await syncNpmMirror({ ...options, timeout: 15 }, h.runtime))
      .toMatchObject([{ state: 'failed', taskId: 'slow', error: expect.stringContaining('timed out') }])
    expect(h.elapsed()).toBe(15_000)
  })

  it('continues other packages after a task fails and keeps its task ID', async () => {
    const h = harness((url) => {
      if (url.includes('/broken/syncs')) {
        return Response.json({ ok: true, id: 'failed-task', state: 'error', error: 'upstream unavailable' })
      }
      if (url.includes('/syncs')) {
        return Response.json({ ok: true, id: 'good-task', state: 'success' })
      }
      return Response.json(packument)
    })
    const env = { REPO_RELEASE_PUBLISHED_PACKAGES: JSON.stringify([
      { name: 'broken', version: '1.0.0' },
      { name: 'good', version: '1.0.0' },
    ]) }
    expect(await syncNpmMirror({ cwd: '.', published: true, env }, h.runtime)).toMatchObject([
      { name: 'broken', state: 'failed', taskId: 'failed-task', error: expect.stringContaining('upstream unavailable') },
      { name: 'good', state: 'success' },
    ])
  })

  it('rejects malformed task responses instead of reporting submission as completion', async () => {
    const h = harness(url => url.includes('/syncs')
      ? Response.json({ ok: true })
      : Response.json(packument))
    expect(await syncNpmMirror(options, h.runtime)).toMatchObject([{ state: 'failed', error: expect.stringContaining('task response') }])
  })
})
