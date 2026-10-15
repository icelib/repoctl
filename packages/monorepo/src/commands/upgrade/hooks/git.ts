import { execFileSync } from 'node:child_process'
import { rmdir } from 'node:fs/promises'
import path from 'node:path'

/** Only remove this checkout's old Husky setting; never change global Git config. */
export function resetHuskyHooksPath(cwd: string) {
  const options = { cwd, encoding: 'utf8' as const, stdio: ['ignore', 'pipe', 'ignore'] as ['ignore', 'pipe', 'ignore'] }
  let root: string
  let hooksPath: string
  try {
    root = execFileSync('git', ['rev-parse', '--show-toplevel'], options).trim()
    if (path.resolve(root) !== path.resolve(cwd)) {
      return
    }
    hooksPath = execFileSync('git', ['config', '--local', '--get', 'core.hooksPath'], options).trim()
  }
  catch {
    return
  }
  const absolute = path.resolve(cwd, hooksPath)
  if ([path.join(cwd, '.husky'), path.join(cwd, '.husky', '_')].includes(absolute)) {
    execFileSync('git', ['config', '--local', '--unset-all', 'core.hooksPath'], options)
  }
}

/** Run only after the reviewed hook transaction succeeds. */
export async function finishHooksUpgrade(cwd: string) {
  resetHuskyHooksPath(cwd)
  for (const directory of ['.husky/_', '.husky']) {
    try {
      await rmdir(path.join(cwd, directory))
    }
    catch (error) {
      if (!['ENOENT', 'ENOTEMPTY', 'EEXIST'].includes((error as NodeJS.ErrnoException).code ?? '')) {
        throw error
      }
    }
  }
}
