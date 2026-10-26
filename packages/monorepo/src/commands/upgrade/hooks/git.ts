import { rmdir } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { hookRepositoryRoot, ownedHuskySetting, unsetOwnedHuskySetting } from '../../hooks/git'

/** Only remove this checkout's old Husky setting; never change global Git config. */
export function resetHuskyHooksPath(cwd: string) {
  const root = hookRepositoryRoot(cwd, process.env)
  if (!root || path.resolve(root) !== path.resolve(cwd)) {
    return
  }
  const setting = ownedHuskySetting(root, process.env)
  // Shared local config belongs to the main checkout; a worktree upgrade cannot
  // prove that checkout's deleted hooks participated in its reviewed transaction.
  if (setting?.owner === root) {
    unsetOwnedHuskySetting(root, process.env, setting.scope)
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
