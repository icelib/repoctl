import { readFileSync, writeFileSync } from 'node:fs'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'pathe'
import { vi } from 'vitest'

interface SpawnCall {
  command: string
  args: string[]
}

const tempRoots: string[] = []

export async function createTempWorkspace(lane = 'next') {
  const cwd = await mkdtemp(path.join(tmpdir(), 'repo-release-'))
  tempRoots.push(cwd)

  await mkdir(path.join(cwd, '.changeset'), { recursive: true })
  await mkdir(path.join(cwd, 'packages', 'repoctl'), { recursive: true })
  await mkdir(path.join(cwd, 'packages', 'private'), { recursive: true })
  await writeFile(path.join(cwd, 'packages', 'repoctl', 'package.json'), JSON.stringify({
    name: 'repoctl',
    version: '1.0.0',
  }), 'utf8')
  await writeFile(path.join(cwd, 'packages', 'private', 'package.json'), JSON.stringify({
    name: 'private-package',
    version: '1.0.0',
    private: true,
  }), 'utf8')
  await writeFile(path.join(cwd, 'pnpm-workspace.yaml'), [
    'packages:',
    '  - packages/*',
    'versioning:',
    '  lanes:',
    `    repoctl: ${lane}`,
  ].join('\n'), 'utf8')

  return cwd
}

export async function writePendingIntent(cwd: string, name = 'pending-change') {
  await writeFile(path.join(cwd, '.changeset', `${name}.md`), [
    '---',
    'repoctl: patch',
    '---',
    '',
    'Release change.',
  ].join('\n'), 'utf8')
}

export function createSpawnMock(options: {
  diffStatus?: number
  publishedPackages?: Array<{ name: string, version: string }>
  statuses?: Record<string, number>
  statusSequences?: Record<string, number[]>
  stdout?: Record<string, string>
  stdoutSequences?: Record<string, string[]>
  stderr?: Record<string, string>
  stderrSequences?: Record<string, string[]>
} = {}) {
  const calls: SpawnCall[] = []
  const hookEnvs: NodeJS.ProcessEnv[] = []
  const sequenceIndexes = new Map<string, number>()
  const spawn = vi.fn((command: string, args: string[], spawnOptions?: { cwd?: string, env?: NodeJS.ProcessEnv }) => {
    calls.push({ command, args })
    const commandLine = `${command} ${args.join(' ')}`
    const sequenceIndex = sequenceIndexes.get(commandLine) ?? 0
    sequenceIndexes.set(commandLine, sequenceIndex + 1)

    if (command === 'pnpm' && args[0] === 'version' && spawnOptions?.cwd) {
      for (const pkg of options.publishedPackages ?? []) {
        const filename = path.join(spawnOptions.cwd, 'packages', 'repoctl', 'package.json')
        const manifest = JSON.parse(readFileSync(filename, 'utf8'))
        if (manifest.name === pkg.name) {
          writeFileSync(filename, JSON.stringify({ ...manifest, version: pkg.version }))
        }
      }
    }
    if (command === 'pnpm' && args[0] === 'publish' && spawnOptions?.cwd) {
      writeFileSync(path.join(spawnOptions.cwd, 'pnpm-publish-summary.json'), JSON.stringify({
        publishedPackages: options.publishedPackages ?? [],
      }))
    }
    if (command === 'pnpm' && args[0] === 'run' && !['build', 'lint', 'test'].includes(args[1] ?? '')) {
      hookEnvs.push(spawnOptions?.env ?? {})
    }

    if (command === 'git' && args.join(' ') === 'diff --quiet --exit-code') {
      return { status: options.diffStatus ?? 0, stdout: '' }
    }

    return {
      status: options.statusSequences?.[commandLine]?.[sequenceIndex] ?? options.statuses?.[commandLine] ?? 0,
      stdout: options.stdoutSequences?.[commandLine]?.[sequenceIndex] ?? options.stdout?.[commandLine] ?? (command === 'npm' && args[0] === 'view'
        ? options.publishedPackages?.find(pkg => `${pkg.name}@${pkg.version}` === args[1])?.version ?? ''
        : ''),
      stderr: options.stderrSequences?.[commandLine]?.[sequenceIndex] ?? options.stderr?.[commandLine] ?? '',
    }
  })

  return { calls, hookEnvs, spawn }
}

export async function cleanupReleaseTempRoots() {
  await Promise.all(tempRoots.splice(0).map(root => rm(root, { force: true, recursive: true })))
}
