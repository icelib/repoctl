import { execFile } from 'node:child_process'
import process from 'node:process'
import { promisify } from 'node:util'
import path from 'pathe'

const exec = promisify(execFile)

export async function removalGit(root: string, target: string) {
  try {
    const run = async (args: string[]) => (await exec('git', ['-C', root, '-c', 'core.fsmonitor=false', '-c', 'core.untrackedCache=false', ...args], {
      encoding: 'utf8',
      env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' },
      maxBuffer: 16 * 1024 * 1024,
      timeout: 30_000,
    })).stdout
    const gitRoot = path.resolve((await run(['rev-parse', '--show-toplevel'])).trim())
    const head = (await run(['rev-parse', 'HEAD'])).trim()
    const relative = path.relative(gitRoot, target)
    const status = await run(['status', '--porcelain=v1', '-z', '--untracked-files=all', '--', `:(top,literal)${relative}`])
    const workspacePath = path.relative(gitRoot, root)
    const tracked = (await run(['ls-files', '-z', '--cached', '--full-name', ...(workspacePath ? ['--', `:(top,literal)${workspacePath}`] : [])]))
      .split('\0')
      .filter(Boolean)
      .map(file => path.relative(root, path.join(gitRoot, file)))
      .sort()
    return { git: { root: gitRoot, head }, dirty: status.length > 0, tracked }
  }
  catch {
    return { git: null, dirty: false, tracked: [] }
  }
}
