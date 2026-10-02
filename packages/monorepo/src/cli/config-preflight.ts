import type { Command } from 'commander'
import process from 'node:process'
import { findWorkspaceDir } from '@pnpm/find-workspace-dir'
import { loadMonorepoConfigDetails } from '../core/config'
import { ConfigValidationError } from '../core/config/validation'

export function registerConfigPreflight(program: Command, cwd: string) {
  program.hook('preAction', async (_parent, action) => {
    let command: Command | null = action
    while (command) {
      if (command.name() === 'config') {
        return
      }
      command = command.parent
    }
    await loadMonorepoConfigDetails(cwd)
    const root = await findWorkspaceDir(cwd)
    if (root && root !== cwd) {
      await loadMonorepoConfigDetails(root)
    }
  })
}

export function reportCliFailure(error: unknown) {
  if (!(error instanceof ConfigValidationError)) {
    throw error
  }
  const output = process.argv.includes('--json')
    ? JSON.stringify({ schemaVersion: 1, valid: false, diagnostics: error.diagnostics })
    : error.message
  process.stderr.write(`${output}\n`)
  process.exitCode = 1
}
