import type { NightlyOptions, NightlyReport } from '@icebreakers/monorepo'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { releaseNightly } from '@icebreakers/monorepo'
import { afterEach, expect, it, vi } from 'vitest'
import { fixture } from './fixture'

const deadlineVariable = 'REPOCTL_NIGHTLY_QUALITY_DEADLINE_EPOCH'
const initialTime = 1_700_000_000_000

interface QualityCall {
  script: string
  timeout: number | undefined
}

interface QualityFixtureOptions {
  deadline?: string
  qualityTimeoutMs?: number
  advanceAfterFirst?: number
  failScript?: string
}

afterEach(() => vi.restoreAllMocks())

async function qualityFixture(settings: QualityFixtureOptions = {}) {
  const h = await fixture()
  const clock = vi.spyOn(Date, 'now').mockReturnValue(initialTime)
  const env: NodeJS.ProcessEnv = { ...h.env }
  delete env[deadlineVariable]
  if (settings.deadline !== undefined) {
    env[deadlineVariable] = settings.deadline
  }
  const calls: QualityCall[] = []
  const unexpectedCommands: string[][] = []
  let failed = false
  const original = h.options.spawn!
  const spawn: NonNullable<NightlyOptions['spawn']> = ((command, args, options) => {
    if (failed) {
      unexpectedCommands.push([command, ...(args ?? [])])
      throw new Error('No command may run after the quality failure.')
    }
    if (command !== 'pnpm' || args?.[0] !== 'run') {
      return original(command, args, options)
    }
    const script = args[1]!
    calls.push({ script, timeout: options?.timeout })
    if (script === 'quality-first' && settings.advanceAfterFirst !== undefined) {
      clock.mockReturnValue(initialTime + settings.advanceAfterFirst)
    }
    if (script === (settings.failScript ?? 'quality-second')) {
      failed = true
      return { pid: 1, output: [null, 'completed checks\n', 'quality fixture failed\n'], stdout: 'completed checks\n', stderr: 'quality fixture failed\n', status: 17, signal: null }
    }
    return { pid: 1, output: [null, 'quality passed\n', ''], stdout: 'quality passed\n', stderr: '', status: 0, signal: null }
  }) as NonNullable<NightlyOptions['spawn']>
  const run = () => releaseNightly({
    ...h.options,
    env,
    spawn,
    publish: true,
    config: {
      ...h.options.config,
      nightly: {
        ...h.options.config?.nightly,
        provider: 'pkg-pr-new',
        ...(settings.qualityTimeoutMs === undefined ? {} : { qualityTimeoutMs: settings.qualityTimeoutMs }),
      },
      qualityScripts: ['quality-first', 'quality-second'],
      hooks: { verify: ['quality-hook', 'must-not-verify'] },
    },
  })
  return { ...h, calls, unexpectedCommands, run }
}

async function expectStoppedBeforePreparation(h: Awaited<ReturnType<typeof qualityFixture>>, report: NightlyReport) {
  expect(report.status).toBe('failed')
  expect(report.snapshot?.status).toBe('planned')
  expect(report.snapshot?.packages.every(pkg => !pkg.tarball && !pkg.published)).toBe(true)
  expect(report.confirmed).not.toBe(true)
  expect(report.consumer).toBeUndefined()
  expect(h.uploads).toEqual([])
  expect(h.unexpectedCommands).toEqual([])
  expect(JSON.parse(await readFile(path.join(report.outputDirectory!, 'nightly-report.json'), 'utf8'))).toEqual(report)
  expect(await readFile(h.env.GITHUB_STEP_SUMMARY, 'utf8')).toContain(report.error!)
}

it.each([
  { label: 'default forty-five minute budget', qualityTimeoutMs: undefined, expected: 2_700_000 },
  { label: 'configured budget', qualityTimeoutMs: 123_456, expected: 123_456 },
])('preserves the $label without a deadline through the built public API', async ({ qualityTimeoutMs, expected }) => {
  const h = await qualityFixture(qualityTimeoutMs === undefined ? {} : { qualityTimeoutMs })
  const report = await h.run()
  expect(report.error).toBe('Nightly pnpm run quality-second failed: quality fixture failed')
  expect(h.calls).toEqual([
    { script: 'quality-first', timeout: expected },
    { script: 'quality-second', timeout: expected },
  ])
  expect(report.commands[1]).toMatchObject({ exitCode: 17, stdout: 'completed checks\n', stderr: 'quality fixture failed\n' })
  await expectStoppedBeforePreparation(h, report)
})

it('shares one decreasing deadline across quality scripts and verification hooks through the built public API', async () => {
  const h = await qualityFixture({
    deadline: String(initialTime / 1000 + 2700),
    qualityTimeoutMs: 60_000,
    advanceAfterFirst: 300_000,
    failScript: 'quality-hook',
  })
  const report = await h.run()
  expect(report.error).toBe('Nightly pnpm run quality-hook failed: quality fixture failed')
  expect(h.calls).toEqual([
    { script: 'quality-first', timeout: 2_700_000 },
    { script: 'quality-second', timeout: 2_400_000 },
    { script: 'quality-hook', timeout: 2_400_000 },
  ])
  expect(report.commands.map(command => command.args)).toEqual([['run', 'quality-first'], ['run', 'quality-second'], ['run', 'quality-hook']])
  await expectStoppedBeforePreparation(h, report)
})

it.each([
  { label: 'expired', deadline: String(initialTime / 1000 - 1), message: 'Nightly shared quality budget exhausted before starting a command.' },
  { label: 'at the deadline', deadline: String(initialTime / 1000), message: 'Nightly shared quality budget exhausted before starting a command.' },
  { label: 'invalid', deadline: 'tomorrow', message: 'Nightly quality deadline must be a positive safe integer epoch timestamp.' },
])('does not start quality or prepare artifacts when the deadline is $label', async ({ deadline, message }) => {
  const h = await qualityFixture({ deadline })
  const report = await h.run()
  expect(report.error).toBe(message)
  expect(h.calls).toEqual([])
  expect(report.commands).toEqual([])
  await expectStoppedBeforePreparation(h, report)
})

it('does not start the next quality command after the shared budget is consumed', async () => {
  const h = await qualityFixture({ deadline: String(initialTime / 1000 + 2700), advanceAfterFirst: 2_700_000 })
  const report = await h.run()
  expect(report.error).toBe('Nightly shared quality budget exhausted before starting a command.')
  expect(h.calls).toEqual([{ script: 'quality-first', timeout: 2_700_000 }])
  expect(report.commands.map(command => command.args)).toEqual([['run', 'quality-first']])
  await expectStoppedBeforePreparation(h, report)
})

it('stops later quality scripts, hooks, preparation and publication after the first failed command', async () => {
  const h = await qualityFixture({ deadline: String(initialTime / 1000 + 2700), failScript: 'quality-first' })
  const report = await h.run()
  expect(report.error).toBe('Nightly pnpm run quality-first failed: quality fixture failed')
  expect(h.calls).toEqual([{ script: 'quality-first', timeout: 2_700_000 }])
  expect(report.commands).toEqual([expect.objectContaining({ args: ['run', 'quality-first'], exitCode: 17, stdout: 'completed checks\n', stderr: 'quality fixture failed\n' })])
  await expectStoppedBeforePreparation(h, report)
})
