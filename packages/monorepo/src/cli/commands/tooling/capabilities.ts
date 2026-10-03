import type { Command } from '@icebreakers/monorepo-templates'
import { readFile } from 'node:fs/promises'
import process from 'node:process'
import { applyToolingCapability, listToolingCapabilities, planToolingCapability } from '../../../commands/tooling-capabilities'
import { logger } from '../../../core/logger'
import { localize } from '../../../i18n'

interface CapabilityCliOptions {
  target: string
  route: string
  expectText: string
  testId?: string
  role?: string
  name?: string
  directory?: string
  port?: string
  ciPort?: string
  reuseExistingServer?: boolean
  json?: boolean
}

export function registerCapabilityCommands(toolingCommand: Command, cwd: string) {
  const capabilities = toolingCommand.command('capability').description(localize('Add an incremental tooling capability', '增量接入工程化能力包'))
  capabilities.command('list').option('--json').action((options: { json?: boolean }) => {
    const result = listToolingCapabilities()
    if (options.json) {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
    }
    else { result.forEach(item => logger.info(`${item.id}@${item.version}: ${item.description}`)) }
  })
  capabilities.command('plan <capability>').requiredOption('--target <workspace>').requiredOption('--route <path>').requiredOption('--expect-text <text>').option('--test-id <id>').option('--role <role>').option('--name <name>').option('--directory <path>').option('--port <port>').option('--ci-port <port>').option('--reuse-existing-server').option('--json').action(async (capability: 'playwright', options: CapabilityCliOptions) => {
    if (capability !== 'playwright') {
      throw new Error(`Unknown tooling capability: ${capability}`)
    }
    const click = options.testId ? { testId: options.testId as string } : { role: (options.role ?? 'button') as 'button' | 'link', name: options.name as string }
    const result = await planToolingCapability(cwd, { capability, target: options.target as string, interaction: { route: options.route as string, click, expectText: options.expectText as string }, ...(options.directory ? { directory: options.directory as string } : {}), ...(options.port ? { port: Number(options.port) } : {}), ...(options.ciPort ? { ciPort: Number(options.ciPort) } : {}), ...(options.reuseExistingServer ? { reuseExistingServer: true } : {}) })
    if (options.json) {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
    }
    else { logger.info(`${result.status}: ${result.files.length} files, ${result.conflicts.length} conflicts`) }
  })
  capabilities.command('apply <plan>').option('--json').action(async (file: string, options: { json?: boolean }) => {
    const result = await applyToolingCapability(JSON.parse(await readFile(file, 'utf8')))
    if (options.json) {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
    }
    else { logger.success(localize('Tooling capability applied.', '工程化能力包已应用。')) }
  })
}
