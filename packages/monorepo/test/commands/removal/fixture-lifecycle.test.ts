import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'pathe'
import { afterEach, expect, it, vi } from 'vitest'
import { commit, fixture, git, snapshot } from './fixture'

const traces: string[] = []
afterEach(async () => {
  vi.unstubAllEnvs()
  await Promise.all(traces.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
})

it.each([false, true])('keeps Git maintenance out of snapshot fixtures, including manual initialization (nested: %s)', async (nested) => {
  const h = await fixture({}, { git: false })
  const cwd = nested ? h.root : h.workspace
  await git(cwd, ['init'])
  // Exercise the helper against an enabled repository policy, independent of
  // the runner's global configuration. Keep an unprotected regression synchronous.
  await git(cwd, ['config', 'maintenance.auto', 'true'])
  await git(cwd, ['config', 'gc.auto', '1'])
  await git(cwd, ['config', 'maintenance.autoDetach', 'false'])
  await git(cwd, ['config', 'gc.autoDetach', 'false'])
  const traceDirectory = await mkdtemp(path.join(tmpdir(), 'repoctl-git-trace-'))
  traces.push(traceDirectory)
  const trace = path.join(traceDirectory, 'events.jsonl')
  vi.stubEnv('GIT_TRACE2_EVENT', trace)

  await commit(cwd)
  const events = (await readFile(trace, 'utf8')).trim().split('\n').map(line => JSON.parse(line) as { event: string, argv?: string[] })
  expect(events.some(event => event.event === 'start' && event.argv?.includes('commit'))).toBe(true)
  const maintenance = events.filter(event => event.event === 'child_start'
    && event.argv?.some(argument => argument === 'maintenance' || argument === 'gc'))
  expect(maintenance).toEqual([])
  const before = await snapshot(cwd)
  expect(await snapshot(cwd)).toEqual(before)
})
