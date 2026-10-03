import path from 'node:path'
import process from 'node:process'
import { Command, Option } from 'commander'
import { cliName, version } from '../constants'
import { message, supportedLocales } from '../i18n'
import { registerAiCommands } from './commands/ai'
import { registerConfigCommands } from './commands/config'
import { registerDepsCommands } from './commands/deps'
import { registerEnvCommands } from './commands/env'
import { registerMaintenanceCommands } from './commands/maintenance'
import { registerPackageCommands } from './commands/package'
import { registerReleaseCommands } from './commands/release'
import { registerSkillsCommands } from './commands/skills'
import { registerTemplatesCommands } from './commands/template-catalog'
import { registerToolingCommands } from './commands/tooling'
import { registerTopLevelCommands } from './commands/top-level'
import { registerVerifyCommands } from './commands/verify'
import { registerWorkspaceCommands } from './commands/workspace'

const cwd = process.cwd()
const program = new Command()
const invokedName = path.basename(process.argv[1] ?? '', path.extname(process.argv[1] ?? ''))
const activeCliName = invokedName === 'repoctl' ? 'repoctl' : cliName

function localizeHelpMetadata(value: string) {
  return value
    .replaceAll('choices:', message('choicesLabel'))
    .replaceAll('default:', message('defaultLabel'))
    .replaceAll('preset:', message('presetLabel'))
    .replaceAll('env:', message('envLabel'))
}

function localizeCommanderError(value: string) {
  return value
    .replaceAll('Did you mean one of', message('commanderDidYouMeanOneOf'))
    .replaceAll('Did you mean', message('commanderDidYouMean'))
    .replaceAll('Allowed choices are', message('commanderAllowedChoices'))
    .replaceAll('missing required argument', message('commanderMissingRequiredArgument'))
    .replaceAll('required option', message('commanderRequiredOption'))
    .replaceAll('argument missing', message('commanderArgumentMissing'))
    .replaceAll('not specified', message('commanderNotSpecified'))
    .replaceAll('too many arguments', message('commanderTooManyArguments'))
    .replaceAll('unknown command', message('commanderUnknownCommand'))
    .replaceAll('unknown option', message('commanderUnknownOption'))
    .replace(/^error:/, message('commanderErrorPrefix'))
}

function configureLocalizedHelp(command: Command) {
  const defaultHelp = command.createHelp()
  const titles: Record<string, string> = {
    'Arguments:': message('argumentsTitle'),
    'Commands:': message('commandsTitle'),
    'Global Options:': message('globalOptionsTitle'),
    'Options:': message('optionsTitle'),
    'Usage:': message('usageTitle'),
  }

  command
    .helpOption('-h, --help', message('helpOption'))
    .configureOutput({
      outputError: (value, write) => write(localizeCommanderError(value)),
    })
    .configureHelp({
      argumentDescription: argument => localizeHelpMetadata(defaultHelp.argumentDescription(argument)),
      optionDescription: option => localizeHelpMetadata(defaultHelp.optionDescription(option)),
      styleTitle: title => titles[title] ?? title,
    })

  if (command.commands.length) {
    command.addHelpCommand('help [command]', message('helpCommand'))
  }
  command.commands.forEach(configureLocalizedHelp)
}

program
  .name(activeCliName)
  .version(version, '-V, --version', message('versionOption'))
  .description(message('cliDescription'))
  .addOption(new Option('--lang <locale>', message('languageOption')).choices([...supportedLocales]))

registerTopLevelCommands(program, cwd)
registerTemplatesCommands(program)
registerWorkspaceCommands(program, cwd)
registerToolingCommands(program, cwd)
registerEnvCommands(program, cwd)
registerConfigCommands(program, cwd)
registerDepsCommands(program, cwd)
registerReleaseCommands(program, cwd)
registerSkillsCommands(program, cwd)
registerVerifyCommands(program, cwd)
registerAiCommands(program, cwd)
registerPackageCommands(program, cwd)
registerMaintenanceCommands(program, cwd)

configureLocalizedHelp(program)
program.addHelpText('after', message('quickStart', { cliName: activeCliName }))

export default program
