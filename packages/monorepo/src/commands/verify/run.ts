import type { spawnSync, SpawnSyncOptions } from 'node:child_process'
import process from 'node:process'

export function runPnpmCommand(
  cwd: string,
  label: string,
  args: string[],
  spawn: typeof spawnSync,
) {
  process.stdout.write(`${label}\n`)
  const options: SpawnSyncOptions = {
    cwd,
    stdio: 'inherit',
  }
  const result = spawn('pnpm', args, options)
  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

export function runShellCommand(cwd: string, label: string, command: string, spawn: typeof spawnSync) {
  process.stdout.write(`${label}\n`)
  const result = spawn('sh', ['-lc', command], {
    cwd,
    stdio: 'inherit',
  })
  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}
