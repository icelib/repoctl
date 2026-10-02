import type { ExecFileSyncOptionsWithStringEncoding } from 'node:child_process'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const roots: string[] = []

export function cleanupRepositories() {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
}

export function createRepository(objectFormat: 'sha1' | 'sha256' = 'sha1') {
  const root = mkdtempSync(path.join(tmpdir(), 'repoctl-push-refs-'))
  roots.push(root)
  const git = (...args: string[]) => execFileSync('git', [
    '-c',
    'core.hooksPath=',
    '-c',
    'commit.gpgsign=false',
    '-c',
    'tag.gpgSign=false',
    '-c',
    'user.name=repoctl-test',
    '-c',
    'user.email=test@example.invalid',
    ...args,
  ], { cwd: root, encoding: 'utf8', stdio: 'pipe' }).trim()
  git('init', '-q', `--object-format=${objectFormat}`)
  const write = (file: string, content: string) => {
    const filename = path.join(root, file)
    mkdirSync(path.dirname(filename), { recursive: true })
    writeFileSync(filename, content)
  }
  const commit = () => {
    git('add', '-A')
    git('commit', '-qm', 'fixture')
    return git('rev-parse', 'HEAD')
  }
  return { root, git, write, commit }
}

export function hookLine(localSha: string, remoteSha = '0'.repeat(localSha.length), remoteRef = 'refs/heads/main', localRef = remoteRef) {
  return `${localRef} ${localSha} ${remoteRef} ${remoteSha}`
}

export function recordGitCalls() {
  const calls: string[][] = []
  const environments: (NodeJS.ProcessEnv | undefined)[] = []
  const execute = (file: string, args: string[], options: ExecFileSyncOptionsWithStringEncoding) => {
    calls.push(args)
    environments.push(options.env)
    return execFileSync(file, args, { ...options, stdio: 'pipe' })
  }
  return { calls, environments, execFile: execute as typeof execFileSync }
}
