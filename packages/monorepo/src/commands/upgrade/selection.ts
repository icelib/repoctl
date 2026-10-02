import type { PreparedUpgrade } from './types'
import process from 'node:process'
import { checkbox } from '@icebreakers/monorepo-templates'
import { localize } from '../../i18n'

export async function selectOperations(prepared: PreparedUpgrade) {
  const { operations, options } = prepared
  const pending = operations.filter(item => item.file.action !== 'skip' && item.file.requiresConfirmation)
  const selected = new Set(operations.filter(item => item.file.action !== 'skip' && !item.file.requiresConfirmation).map(item => item.file.path))
  if (!options.noOverwrite && !options.skipOverwrite) {
    if (options.yes || options.overwrite) {
      for (const operation of pending) {
        selected.add(operation.file.path)
      }
    }
    else if (pending.length && process.stdin.isTTY && process.stdout.isTTY) {
      const choices = await checkbox({
        message: localize('Select changed managed files to overwrite', '检测到以下文件内容与当前仓库不同，请选择要覆盖的文件'),
        choices: pending.map(item => ({ name: item.file.path, value: item.targetPath, checked: false })),
        loop: false,
      })
      for (const operation of pending) {
        if (choices.includes(operation.targetPath)) {
          selected.add(operation.file.path)
        }
      }
    }
  }
  const satisfied = (relativePath: string) => selected.has(relativePath)
    || operations.some(item => item.file.path === relativePath && item.file.action === 'skip' && item.file.reason === 'identical')
  let changed = true
  while (changed) {
    changed = false
    for (const operation of operations) {
      if (selected.has(operation.file.path) && !operation.file.dependsOn.every(satisfied)) {
        selected.delete(operation.file.path)
        changed = true
      }
    }
  }
  return operations.filter(item => selected.has(item.file.path))
}
