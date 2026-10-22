import type { PackageCheckCommand } from '../../../package-check/types'
import type { NightlyConsumerReport, NightlyOptions } from '../types'
import { execute, failureMessage } from '../../../package-check/process'

export class ConsumerCommandError extends Error {
  constructor(readonly command: PackageCheckCommand) {
    super(failureMessage({ ...command, output: command.output.slice(-8000) }))
  }
}

export function consumerRunner(result: NightlyConsumerReport, options: NightlyOptions, cwd: string, env: NodeJS.ProcessEnv) {
  return async (executable: string, args: string[], timeout = 600_000) => {
    let command: PackageCheckCommand
    if (options.spawn) {
      const completed = options.spawn(executable, args, { cwd, env, timeout, encoding: 'utf8', shell: false, stdio: ['ignore', 'pipe', 'pipe'] })
      const stdout = String(completed.stdout ?? '')
      const stderr = String(completed.stderr ?? '')
      command = { cwd, executable, args, exitCode: completed.error ? null : completed.status, stdout, stderr, output: `${stdout}\n${stderr}${completed.error ? `\n${completed.error.message}` : ''}` }
    }
    else {
      command = await execute(executable, args, cwd, timeout, { env })
    }
    const output = command.stdout.trim()
    result.commands.push({ ...command, stdout: command.stdout.slice(-4000), stderr: command.stderr.slice(-4000), output: command.output.slice(-8000) })
    if (command.exitCode !== 0) {
      throw new ConsumerCommandError(command)
    }
    return output
  }
}
