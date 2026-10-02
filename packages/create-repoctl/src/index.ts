import type { CreateRepoctlLocale } from './i18n'
import path from 'node:path'
import process from 'node:process'
import { Command } from '@icebreakers/monorepo-templates'
import { createTranslator, isCreateRepoctlLocale, resolveCreateRepoctlLocale } from './i18n'
import { formatNextSteps } from './next-steps'
import { updateRootPackageJson } from './package-json'
import { promptTargetDir, promptTemplates } from './prompts'
import { scaffoldFromNpm } from './source-npm'
import { resolveTemplateSelections } from './templates'
import { updateRootTsconfigReferences } from './tsconfig'

export interface CreateRepoctlProgramOptions {
  commandName?: string
  defaultTarget?: string
  cwd?: string
  argv?: readonly string[]
  env?: Record<string, string | undefined>
}

interface CreateOptions {
  templates?: string
  force?: boolean
  yes?: boolean
  lang?: string
}

export function createCreateRepoctlProgram(options: CreateRepoctlProgramOptions = {}) {
  const commandName = options.commandName ?? 'create-repoctl'
  const defaultTarget = options.defaultTarget ?? 'repoctl-workspace'
  const cwd = options.cwd ?? process.cwd()
  const argv = options.argv ?? process.argv
  const locale = resolveCreateRepoctlLocale(argv, options.env ?? process.env)
  const t = createTranslator(locale)
  const program = new Command()
  const defaultHelp = program.createHelp()
  const titles: Record<string, string> = {
    'Arguments:': t('argumentsTitle'),
    'Commands:': t('commandsTitle'),
    'Global Options:': t('globalOptionsTitle'),
    'Options:': t('optionsTitle'),
    'Usage:': t('usageTitle'),
  }
  const localizeHelpMetadata = (value: string) => value
    .replaceAll('choices:', t('choicesLabel'))
    .replaceAll('default:', t('defaultLabel'))
    .replaceAll('preset:', t('presetLabel'))
    .replaceAll('env:', t('envLabel'))
  const localizeCommanderError = (value: string) => value
    .replaceAll('Did you mean one of', t('commanderDidYouMeanOneOf'))
    .replaceAll('Did you mean', t('commanderDidYouMean'))
    .replaceAll('Allowed choices are', t('commanderAllowedChoices'))
    .replaceAll('missing required argument', t('commanderMissingRequiredArgument'))
    .replaceAll('required option', t('commanderRequiredOption'))
    .replaceAll('argument missing', t('commanderArgumentMissing'))
    .replaceAll('not specified', t('commanderNotSpecified'))
    .replaceAll('too many arguments', t('commanderTooManyArguments'))
    .replaceAll('unknown command', t('commanderUnknownCommand'))
    .replaceAll('unknown option', t('commanderUnknownOption'))
    .replace(/^error:/, t('commanderErrorPrefix'))

  program
    .name(commandName)
    .description(t('description'))
    .argument('[dir]', t('targetArgument'), defaultTarget)
    .option('-t, --templates <list>', t('templatesOption'))
    .option('-f, --force', t('forceOption'), false)
    .option('-y, --yes', t('yesOption'), false)
    .option('--lang <locale>', t('languageOption'))
    .helpOption('-h, --help', t('helpOption'))
    .configureOutput({
      outputError: (value, write) => write(localizeCommanderError(value)),
    })
    .configureHelp({
      argumentDescription: argument => localizeHelpMetadata(defaultHelp.argumentDescription(argument)),
      optionDescription: option => localizeHelpMetadata(defaultHelp.optionDescription(option)),
      styleTitle: title => titles[title] ?? title,
    })
    .action(async (targetDirInput: string, createOptions: CreateOptions) => {
      if (createOptions.lang && !isCreateRepoctlLocale(createOptions.lang)) {
        throw new Error(t('invalidLocale', { locale: createOptions.lang }))
      }

      const isInteractive = !createOptions.yes && Boolean(process.stdin.isTTY && process.stdout.isTTY)
      let targetInput = targetDirInput || defaultTarget
      if (isInteractive) {
        targetInput = await promptTargetDir(targetInput, t('targetPrompt', { defaultDir: targetInput }))
      }

      let selectedTemplates: string[] = []
      if (createOptions.templates) {
        const { selections, unknown } = resolveTemplateSelections(createOptions.templates)
        if (unknown.length) {
          process.stderr.write(`${t('unknownTemplates', { templates: unknown.join(', ') })}\n`)
        }
        selectedTemplates = selections
      }
      else if (isInteractive) {
        selectedTemplates = await promptTemplates(t('templatesPrompt'))
      }

      const targetDir = path.resolve(cwd, targetInput)
      const projectName = path.basename(targetDir) || targetInput
      await scaffoldFromNpm(targetDir, selectedTemplates, Boolean(createOptions.force), async () => {
        await updateRootPackageJson(targetDir, projectName)
        await updateRootTsconfigReferences(targetDir)
      })
      process.stdout.write(formatNextSteps(targetDir, cwd, t('complete')))
    })

  return program
}

export { resolveCreateRepoctlLocale }
export type { CreateRepoctlLocale }
