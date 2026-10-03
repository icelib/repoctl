import type { fixture } from '../removal/fixture'
import { spawnSync } from 'node:child_process'
import process from 'node:process'
import path from 'pathe'

export { commit, fixture, git, snapshot, writeJson } from '../removal/fixture'

const cli = path.resolve(import.meta.dirname, '../../../bin/repoctl.js')
export function runCli(h: Awaited<ReturnType<typeof fixture>>, args: string[]) {
  return spawnSync(process.execPath, [cli, '--lang', 'en', 'workspace', 'move', ...args], {
    cwd: h.workspace,
    encoding: 'utf8',
    timeout: 30_000,
    env: { ...process.env, HOME: h.home, USERPROFILE: h.home, NODE_ENV: 'production', NO_COLOR: '1' },
  })
}
