import { performance } from 'node:perf_hooks'
import { publishStable } from '@icebreakers/monorepo'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanupReleaseTempRoots } from '../release-fixtures'
import { a, b, publishHarness } from './publish-fixtures'

afterEach(async () => {
  vi.restoreAllMocks()
  await cleanupReleaseTempRoots()
})

describe('built public publishStable progress', () => {
  it('never reuploads accepted versions when pnpm omits its partial summary', async () => {
    const h = await publishHarness([
      { status: 1, stdout: `\u001B[32m✅ Published package ${a.name}@${a.version}\u001B[0m\r\n`, stderr: 'GitHub OIDC idToken request: HTTP 503\nFailed to publish package @scope/b@1.0.0 (status 404 Not Found)' },
      { status: 0, summary: [b] },
    ], (spec, { attempts, elapsed }) => (attempts === 2 && (spec.startsWith(b.name) || elapsed >= 30_000)) ? '1.0.0' : '')

    await expect(publishStable(h.options)).resolves.toEqual([a, b])
    expect(h.uploads()).toHaveLength(2)
    expect(h.uploads()[1]?.args).toEqual(['publish', '-r', '--report-summary', '--provenance', '--no-git-checks', '--filter', b.name])
    expect(h.sleep.mock.calls.map(([ms]) => ms)).toEqual([20_000, 10_000])
    expect(await h.report()).toMatchObject({ status: 'complete', acceptedPackages: [a, b], confirmedPackages: [a, b] })
    expect(await h.summary()).toEqual({ publishedPackages: [a, b] })
    for (const call of h.uploads()) {
      expect(call.options).toMatchObject({ shell: false, env: h.options.env })
    }
    expect(h.calls.filter(call => call.command === 'pnpm' && call.args[0] === 'run').map(call => call.args[1])).toEqual(['quality', 'before'])
  })

  it('retains accepted progress when a later permanent failure overwrites summary', async () => {
    const h = await publishHarness([
      { status: 1, summary: [a], stderr: 'HTTP 503' },
      { status: 1, summary: [], stderr: 'E403 forbidden' },
    ], () => '')

    await expect(publishStable(h.options)).rejects.toThrow('command failed: pnpm')
    expect(h.uploads()[1]?.args.slice(-2)).toEqual(['--filter', b.name])
    expect(await h.summary()).toEqual({ publishedPackages: [a] })
    expect(await h.report()).toMatchObject({ status: 'failed', acceptedPackages: [a], confirmedPackages: [] })
  })

  it('refreshes the retry filters after the backoff, including versions without upload evidence', async () => {
    const h = await publishHarness([
      { status: 1, stderr: 'HTTP 503' },
      { status: 0, summary: [b] },
    ], (spec, { attempts, elapsed }) => ((spec.startsWith(a.name) && elapsed >= 20_000) || attempts === 2) ? '1.0.0' : '')

    await expect(publishStable(h.options)).resolves.toEqual([a, b])
    expect(h.uploads()[1]?.args.slice(-2)).toEqual(['--filter', b.name])
  })

  it('reconciles staged conflicts after waiting without uploading again', async () => {
    const h = await publishHarness([
      { status: 1, stderr: 'Failed to publish package repoctl@1.0.0 (status 409 Conflict)\nCannot publish over previously staged version "1.0.0".' },
    ], (_spec, { elapsed }) => elapsed >= 20_000 ? '1.0.0' : '')

    await expect(publishStable(h.options)).resolves.toEqual([a, b])
    expect(h.uploads()).toHaveLength(1)
    expect(h.sleep).toHaveBeenCalledExactlyOnceWith(20_000)
  })

  it('waits read-only for accepted versions after an otherwise successful upload', async () => {
    const h = await publishHarness([{ status: 0, summary: [a, b] }], (_spec, { elapsed }) => elapsed >= 20_000 ? '1.0.0' : '')
    await expect(publishStable(h.options)).resolves.toEqual([a, b])
    expect(h.uploads()).toHaveLength(1)
    expect(h.sleep.mock.calls.map(([ms]) => ms)).toEqual([10_000, 10_000])
  })

  it('allows accepted versions to propagate beyond five minutes without reuploading or querying confirmed versions', async () => {
    const h = await publishHarness([{ status: 0, summary: [a, b] }], (spec, { elapsed }) => spec === `${a.name}@${a.version}` || elapsed >= 310_000 ? '1.0.0' : '')

    await expect(publishStable(h.options)).resolves.toEqual([a, b])
    expect(h.uploads()).toHaveLength(1)
    expect(h.calls.filter(call => call.command === 'npm' && call.args[1] === `${a.name}@${a.version}`)).toHaveLength(1)
    expect(h.sleep.mock.calls.reduce((sum, [ms]) => sum + ms, 0)).toBe(310_000)
    expect(await h.report()).toMatchObject({ status: 'complete', acceptedPackages: [a, b], confirmedPackages: [a, b] })
  })

  it('fails within the visibility budget and preserves accepted but unavailable versions', async () => {
    const h = await publishHarness([{ status: 0, summary: [a, b] }], () => '')
    const release = publishStable(h.options)
    await expect(release).rejects.toThrow(/timed out after 15 minutes; pending versions: repoctl@1\.0\.0, @scope\/b@1\.0\.0/)
    await expect(release).rejects.toThrow('resume confirmation without re-uploading accepted versions')
    expect(h.uploads()).toHaveLength(1)
    expect(h.sleep.mock.calls.reduce((sum, [ms]) => sum + ms, 0)).toBeLessThanOrEqual(900_000)
    expect(h.sleep).toHaveBeenCalledTimes(90)
    expect(h.calls.filter(call => call.command === 'npm').every(call => call.options?.timeout && call.options.timeout <= 10_000)).toBe(true)
    expect(await h.report()).toMatchObject({ status: 'failed', acceptedPackages: [a, b], confirmedPackages: [] })
    expect(await h.summary()).toEqual({ publishedPackages: [a, b] })
  })

  it('does not promote a conflict to upload acceptance when it never becomes visible', async () => {
    const h = await publishHarness([{ status: 1, stderr: 'EPUBLISHCONFLICT' }], () => '')
    await expect(publishStable(h.options)).rejects.toThrow('visibility confirmation timed out')
    expect(h.uploads()).toHaveLength(1)
    expect(await h.report()).toMatchObject({ status: 'failed', acceptedPackages: [], confirmedPackages: [] })
  })

  it('accepts only complete success lines for exact candidate versions', async () => {
    const h = await publishHarness([
      { status: 1, stdout: 'Published package repoctl@0.9.0\nPublishing package repoctl@1.0.0\nPublished package stranger@1.0.0\nnot Published package repoctl@1.0.0\nPublished package repoctl@1.0.0-extra', stderr: 'HTTP 503' },
      { status: 0, stdout: '✅ Published package @scope/b@1.0.0\r\nPublished package @scope/b@1.0.0\n', summary: [a, b] },
    ], (_spec, { attempts }) => attempts === 2 ? '1.0.0' : '')
    await expect(publishStable(h.options)).resolves.toEqual(expect.arrayContaining([a, b]))
    expect(h.uploads()[1]?.args.slice(-4)).toEqual(['--filter', a.name, '--filter', b.name])
    expect((await h.summary()).publishedPackages).toHaveLength(2)
  })

  it.each(['E403 forbidden', 'status 404 Not Found', 'E403 forbidden for repoctl@1.503.0'])('does not retry permanent failure: %s', async (stderr) => {
    const h = await publishHarness([{ status: 1, summary: [a], stderr }], () => '')
    await expect(publishStable(h.options)).rejects.toThrow('command failed: pnpm')
    expect(h.uploads()).toHaveLength(1)
    expect(h.sleep).not.toHaveBeenCalled()
    expect(await h.summary()).toEqual({ publishedPackages: [a] })
  })

  it('preserves partial progress when transient attempts are exhausted', async () => {
    const h = await publishHarness([
      { status: 1, summary: [a], stderr: 'HTTP 503' },
      { status: 1, summary: [], stderr: 'ETIMEDOUT' },
      { status: 1, stderr: 'ECONNRESET' },
    ], () => '')
    await expect(publishStable(h.options)).rejects.toThrow('failed after 3 publish attempts')
    expect(h.uploads()).toHaveLength(3)
    expect(h.uploads().slice(1).every(call => call.args.slice(-2).join(' ') === `--filter ${b.name}`)).toBe(true)
    expect(h.sleep.mock.calls.map(([ms]) => ms)).toEqual([20_000, 40_000])
    expect(await h.summary()).toEqual({ publishedPackages: [a] })
  })

  it('saves output evidence even if pnpm writes a malformed summary', async () => {
    const h = await publishHarness([{ status: 1, stdout: 'Published package repoctl@1.0.0', rawSummary: '{' }])
    await expect(publishStable(h.options)).rejects.toThrow('not valid JSON')
    expect(await h.summary()).toEqual({ publishedPackages: [a] })
    expect(await h.report()).toMatchObject({ status: 'failed', acceptedPackages: [a] })
  })

  it('never downgrades a confirmed version on later registry failures', async () => {
    let aQueries = 0
    const h = await publishHarness([
      { status: 1, stderr: 'HTTP 503' },
      { status: 0, summary: [b] },
    ], (spec, { attempts }) => {
      if (spec.startsWith(a.name)) {
        return ++aQueries === 1 ? a.version : ''
      }
      return attempts === 2 ? b.version : ''
    })
    await expect(publishStable(h.options)).resolves.toEqual([a, b])
    expect(aQueries).toBe(1)
    expect(h.uploads()[1]?.args.slice(-2)).toEqual(['--filter', b.name])
  })

  it('counts slow registry queries against the fifteen-minute budget and bounds the final query to its remainder', async () => {
    let elapsed = 0
    const h = await publishHarness([{ status: 0, summary: [a, b] }], () => {
      elapsed += Math.min(7_000, 900_000 - elapsed)
      return ''
    })
    vi.spyOn(performance, 'now').mockImplementation(() => elapsed)
    h.sleep.mockImplementation(async (milliseconds) => {
      elapsed += milliseconds
    })
    await expect(publishStable(h.options)).rejects.toThrow('visibility confirmation timed out')
    expect(elapsed).toBe(900_000)
    const queries = h.calls.filter(call => call.command === 'npm')
    expect(queries).toHaveLength(76)
    expect(queries.at(-1)?.options?.timeout).toBe(5_000)
    expect(h.uploads()).toHaveLength(1)
  })
})
