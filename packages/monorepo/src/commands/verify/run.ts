import type { SpawnSyncOptions } from 'node:child_process'
import { spawnSync } from 'node:child_process'
import process from 'node:process'
import crossSpawn from 'cross-spawn'

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
  // pnpm can be a .cmd/Corepack shim on Windows. Keep injected runners intact.
  const run = spawn === spawnSync ? crossSpawn.sync : spawn
  const result = run('pnpm', args, options)
  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}
