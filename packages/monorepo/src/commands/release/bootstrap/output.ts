import assert from 'node:assert/strict'
import { mkdir, readdir } from 'node:fs/promises'

/** 每次执行使用空目录，失败或恢复不能覆盖既有冻结产物与验收历史。 */
export async function emptyBootstrapOutput(directory: string) {
  await mkdir(directory, { recursive: true })
  assert.equal((await readdir(directory)).length, 0, 'Bootstrap evidence directory must be empty; preserve the previous run and select a new output directory')
}
