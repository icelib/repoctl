import type { Command } from 'commander'
import type { ReleaseMode } from '../commands/release/types'
import process from 'node:process'
import { findWorkspaceDir } from '@pnpm/find-workspace-dir'
import { resolveReleaseMode } from '../commands/release/shared'
import { loadMonorepoConfigDetails } from '../core/config'
import { ConfigValidationError } from '../core/config/validation'

export function registerConfigPreflight(program: Command, cwd: string) {
  program.hook('preAction', async (_parent, action) => {
    // The read-only catalog action reports the same validation errors itself.
    // Future subcommands (such as source fetching) still run this preflight.
    if (action.name() === 'templates' && action.parent === program) {
      return
    }
    // Snapshots derive their plan from committed pnpm metadata without loading
    // executable release configuration, including through the CLI entrypoint.
    if (action.name() === 'snapshot' && action.parent?.name() === 'release' && action.parent.parent === program) {
      return
    }
    // 核验与真实发布共享身份，但只读取 pnpm 元数据，不执行发布配置。
    if (action.name() === 'ci' && action.parent?.name() === 'release' && action.parent.parent === program
      && resolveReleaseMode(action.opts<{ mode?: ReleaseMode }>()) === 'oidc-audit') {
      return
    }
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
