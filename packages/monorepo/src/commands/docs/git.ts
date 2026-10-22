import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'pathe'

export function gitOutput(cwd: string, args: string[], input?: string) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, ...(input === undefined ? {} : { input }), stdio: ['pipe', 'pipe', 'pipe'] })
}

export function git(cwd: string, args: string[], input?: string) {
  return gitOutput(cwd, args, input).trimEnd()
}

export function assertSha(value: string, label = 'Source') {
  if (!/^[a-f0-9]{40}$/.test(value)) {
    throw new Error(`${label} must be a full Git commit SHA`)
  }
}

export function isAncestor(cwd: string, ancestor: string, descendant: string) {
  const result = spawnSync('git', ['merge-base', '--is-ancestor', ancestor, descendant], { cwd, encoding: 'utf8' })
  if (result.status !== 0 && result.status !== 1) {
    throw new Error(`Cannot compare documentation source ancestry: ${result.stderr || result.error?.message}`)
  }
  return result.status === 0
}

export function assertMainSource(cwd: string, sha: string) {
  assertSha(sha)
  if (!isAncestor(cwd, sha, 'refs/remotes/origin/main')) {
    throw new Error(`Documentation source ${sha} is not in origin/main; fetch main before planning`)
  }
}

export async function withSource<T>(cwd: string, sha: string, use: (source: string) => Promise<T>): Promise<T> {
  assertMainSource(cwd, sha)
  const temporary = await mkdtemp(path.join(tmpdir(), 'repoctl-docs-'))
  const source = path.join(temporary, 'source')
  try {
    git(cwd, ['clone', '--quiet', '--shared', '--no-checkout', '--', cwd, source])
    git(source, ['checkout', '--quiet', '--detach', sha])
    return await use(await realpath(source))
  }
  finally {
    await rm(temporary, { recursive: true, force: true })
  }
}
