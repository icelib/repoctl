import type { DocsOptions } from '@icebreakers/monorepo'
import { writeFileSync } from 'node:fs'
import { deployDocs } from '@icebreakers/monorepo'
import { expect } from 'vitest'

export function runner(callback?: (args: string[], cwd: string, env: NodeJS.ProcessEnv) => void) {
  const calls: string[][] = []
  const spawn = ((command: string, args: string[], options: { cwd: string, env: NodeJS.ProcessEnv }) => {
    calls.push([command, ...args])
    callback?.(args, options.cwd, options.env)
    if (args[1] === 'docs:stable') {
      writeFileSync(options.env['REPO_DOCS_RESULT_FILE']!, JSON.stringify({ versionId: 'recovered-version' }))
    }
    return { status: 0, stdout: '', stderr: '' }
  }) as unknown as NonNullable<DocsOptions['spawn']>
  return { calls, spawn }
}

export async function loseUpload(options: DocsOptions) {
  await expect(deployDocs({ ...options, spawn: runner((args) => {
    if (args[1] === 'docs:stable') {
      throw new Error('upload response lost')
    }
  }).spawn })).rejects.toThrow('upload response lost')
}
