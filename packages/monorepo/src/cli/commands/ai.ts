import type { Command } from '@icebreakers/monorepo-templates'
import type { AgenticTemplateFormat, GenerateAgenticTemplateOptions } from '../../commands/ai'
import { resolveCommandValues } from '../../core/config/resolution'
import { localize } from '../../i18n'

interface AiTemplateCommandOptions {
  output?: string
  force?: boolean
  format?: AgenticTemplateFormat
  dir?: string
  name?: string
  tasks?: string
}

async function handleAiPromptCreate(cwd: string, opts: AiTemplateCommandOptions) {
  const [
    { input },
    { createTimestampFolderName, defaultAgenticBaseDir, generateAgenticTemplate, generateAgenticTemplates, loadAgenticTasks },
    { resolveCommandConfig },
  ] = await Promise.all([
    import('@icebreakers/monorepo-templates'),
    import('@/commands'),
    import('@/core/config'),
  ])
  const aiConfig = await resolveCommandConfig('ai', cwd)
  const resolved = resolveCommandValues('ai', aiConfig, { format: opts.format, force: opts.force, output: opts.output, baseDir: opts.dir, tasksFile: opts.tasks }).values
  const format = resolved.format!
  const force = resolved.force!
  const output = resolved.output
  const baseDir = resolved.baseDir ?? defaultAgenticBaseDir
  const tasksFile = resolved.tasksFile
  const templateName = opts.name

  const shouldUseTasks = Boolean(tasksFile && !opts.output && !opts.name)

  if (shouldUseTasks) {
    if (!tasksFile) {
      throw new Error(localize('A tasks file path is required when using tasks mode.', '使用 tasks 模式时必须提供任务文件路径。'))
    }
    const tasks = await loadAgenticTasks(tasksFile, cwd)
    await generateAgenticTemplates(tasks, {
      cwd,
      baseDir,
      force,
      format,
    })
    return
  }

  let folderName: string | undefined
  if (!output && !templateName) {
    const generated = createTimestampFolderName()
    const answer = await input({
      message: localize('Which folder should contain the prompt?', '提示词将写入哪个文件夹？（可回车确认或自定义）'),
      default: generated,
    })
    folderName = (answer?.trim?.() ?? generated) || generated
  }

  const templateOptions: GenerateAgenticTemplateOptions = {
    cwd,
    force,
    format,
    baseDir,
  }
  if (output !== undefined) {
    templateOptions.output = output
  }
  if (templateName !== undefined) {
    templateOptions.name = templateName
  }
  if (folderName !== undefined) {
    templateOptions.folderName = folderName
  }

  await generateAgenticTemplate(templateOptions)
}

export function registerAiCommands(program: Command, cwd: string) {
  const aiCommand = program.command('ai').description(localize('AI assistant commands', 'AI 助手工具集'))
  const aiPromptCommand = aiCommand.command('prompt').alias('p').description(localize('Prompt template commands', 'Prompt 模板命令'))

  aiPromptCommand.command('create')
    .alias('new')
    .description(localize('Generate an agentic task prompt template', '生成 Agentic 任务提示词模板'))
    .option('-o, --output <path>', localize('Write to a specific file', '输出到指定文件'))
    .option('-f, --force', localize('Overwrite an existing file', '允许覆盖已存在文件'))
    .option('--format <md|json>', localize('Template format; defaults to md', '模板格式，默认 md'))
    .option('-d, --dir <path>', localize('Base output directory used with --name or --tasks', '默认输出目录（默认 agentic/prompts，下级自动创建时间文件夹），配合 --name / --tasks 使用'))
    .option('-n, --name <name>', localize('Generate a named file with the correct extension', '使用名称快速生成文件，自动添加后缀'))
    .option('-t, --tasks <file>', localize('Generate templates from a JSON task array', '从 JSON 数组批量生成模板'))
    .action(async (opts: AiTemplateCommandOptions) => {
      await handleAiPromptCreate(cwd, opts)
    })
}
