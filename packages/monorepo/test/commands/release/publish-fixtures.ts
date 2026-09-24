import type { publishStable } from '@icebreakers/monorepo'
import { writeFileSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'pathe'
import { vi } from 'vitest'
import { createTempWorkspace } from '../release-fixtures'

type ReleaseOptions = Parameters<typeof publishStable>[0]
type PublishedPackage = Awaited<ReturnType<typeof publishStable>>[number]

export const a = { name: 'repoctl', version: '1.0.0' }
export const b = { name: '@scope/b', version: '1.0.0' }

interface Attempt {
  status: number | null
  stdout?: string
  stderr?: string
  summary?: PublishedPackage[]
  rawSummary?: string
}

interface Call {
  command: string
  args: string[]
  options?: { cwd?: string, env?: NodeJS.ProcessEnv, timeout?: number, shell?: boolean }
}

export async function publishHarness(attempts: Attempt[], query: (spec: string, context: { attempts: number, elapsed: number, queries: number }) => string = spec => spec.slice(spec.lastIndexOf('@') + 1)) {
  const cwd = await createTempWorkspace('main')
  await mkdir(path.join(cwd, 'packages', 'zz-b'))
  await writeFile(path.join(cwd, 'packages', 'zz-b', 'package.json'), JSON.stringify(b))
  const calls: Call[] = []
  let attemptCount = 0
  let elapsed = 0
  let queries = 0
  const spawn = vi.fn((command: string, args: string[], options?: Call['options']) => {
    calls.push({ command, args, ...(options ? { options } : {}) })
    if (command === 'pnpm' && args[0] === 'publish') {
      const attempt = attempts[attemptCount++]
      if (!attempt) {
        throw new Error('Unexpected extra upload')
      }
      if (attempt.summary || attempt.rawSummary) {
        writeFileSync(path.join(cwd, 'pnpm-publish-summary.json'), attempt.rawSummary ?? JSON.stringify({ publishedPackages: attempt.summary }))
      }
      return { status: attempt.status, stdout: attempt.stdout ?? '', stderr: attempt.stderr ?? '' }
    }
    if (command === 'npm') {
      const version = query(args[1]!, { attempts: attemptCount, elapsed, queries: ++queries })
      return { status: version ? 0 : 1, stdout: version, stderr: version ? '' : 'E404 Not Found' }
    }
    if (command === 'pnpm' && args[0] === '--filter') {
      return { status: 0, stdout: a.version }
    }
    if (command === 'git' && args[0] === 'diff') {
      return { status: 1, stdout: '' }
    }
    return { status: 0, stdout: '' }
  })
  const sleep = vi.fn(async (milliseconds: number) => {
    elapsed += milliseconds
  })
  const options: ReleaseOptions = {
    cwd,
    branch: 'main',
    spawn: spawn as unknown as NonNullable<ReleaseOptions['spawn']>,
    sleep,
    env: { NPM_CONFIG_PROVENANCE: 'true', ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'test-oidc' },
    config: { qualityScripts: ['quality'], hooks: { beforePublish: ['before'], afterPublish: [{ script: 'after' }] } },
  }
  return {
    cwd,
    calls,
    options,
    sleep,
    spawn,
    uploads: () => calls.filter(call => call.command === 'pnpm' && call.args[0] === 'publish'),
    report: async () => JSON.parse(await readFile(path.join(cwd, 'repoctl-publish-progress.json'), 'utf8')),
    summary: async () => JSON.parse(await readFile(path.join(cwd, 'pnpm-publish-summary.json'), 'utf8')),
  }
}
