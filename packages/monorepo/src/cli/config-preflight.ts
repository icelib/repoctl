import type { Command } from 'commander'
import type { ReleaseMode } from '../commands/release/types'
import process from 'node:process'
import { findWorkspaceDir } from '@pnpm/find-workspace-dir'
import { resolveReleaseMode } from '../commands/release/shared'
import { loadMonorepoConfigDetails } from '../core/config'
import { withLegacyHookConfig } from '../core/config/legacy-hooks'
import { ConfigValidationError } from '../core/config/validation'

export function registerConfigPreflight(program: Command, cwd: string) {
  program.hook('preAction', async (_parent, action) => {
    // The read-only catalog action reports the same validation errors itself.
    // Future subcommands (such as source fetching) still run this preflight.
    if (action.name() === 'templates' && action.parent === program) {
      return
    }
    // Metadata-only release commands load an explicitly trusted policy themselves.
    // Never evaluate executable configuration from the current candidate checkout.
    const snapshot = action.name() === 'snapshot' ? action : action.parent
    if (snapshot?.name() === 'snapshot' && snapshot.parent?.name() === 'release' && snapshot.parent.parent === program) {
      return
    }
    if (['auto-changeset', 'validate-preparation'].includes(action.name())
      && action.parent?.name() === 'release' && action.parent.parent === program) {
      return
    }
    // Hook installation must decide CI/disabled/custom Git configuration before
    // evaluating tooling configuration, including legacy migration configuration.
    if (action.name() === 'install' && action.parent?.name() === 'hooks'
      && action.parent.parent?.name() === 'tooling' && action.parent.parent.parent === program) {
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
    const validate = async () => {
      await loadMonorepoConfigDetails(cwd)
      const root = await findWorkspaceDir(cwd)
      if (root && root !== cwd) {
        await loadMonorepoConfigDetails(root)
      }
    }
    await (['upgrade', 'doctor'].includes(action.name()) ? withLegacyHookConfig(validate) : validate())
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
