import type { Command } from '@icebreakers/monorepo-templates'
import type { FileHandle } from 'node:fs/promises'
import type { SnapshotWorkflowOptions } from '../../../../commands/release/snapshot/prepared/workflow'
import { lstat, mkdir, open, readFile, unlink } from 'node:fs/promises'
import path from 'node:path'
import { getSnapshotWorkflows } from '../../../../commands/release/snapshot/prepared/workflow'
import { resolveSnapshotWorkflowOptions } from '../../../../commands/release/snapshot/prepared/workflow/options'
import { localize } from '../../../../i18n'
import { writeSnapshotOutput } from './output'

async function exportWorkflows(directory: string, dryRun: boolean, options: SnapshotWorkflowOptions) {
  const configuration = resolveSnapshotWorkflowOptions(options)
  const workflows = await getSnapshotWorkflows(configuration)
  const destinations = { build: configuration.builderWorkflowPath, publish: configuration.publisherWorkflowPath }
  const files = (Object.keys(workflows) as Array<keyof typeof workflows>).map(kind => ({ path: path.join(directory, path.posix.basename(destinations[kind])), content: workflows[kind], status: 'created' as 'created' | 'identical' }))
  // Both destinations are inspected before creating either file.
  for (const file of files) {
    const existing = await lstat(file.path).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') {
        return undefined
      }
      throw error
    })
    if (existing) {
      if (!existing.isFile() || await readFile(file.path, 'utf8') !== file.content) {
        throw new Error(`Snapshot workflow already exists with different content: ${file.path}. Export to an empty directory and review both files together.`)
      }
      file.status = 'identical'
    }
  }
  if (dryRun) {
    return { schemaVersion: 1, dryRun, files }
  }
  await mkdir(directory, { recursive: true })
  const created: Array<{ path: string, handle: FileHandle, inode: number, device: number }> = []
  try {
    for (const file of files.filter(file => file.status === 'created')) {
      const handle = await open(file.path, 'wx')
      const info = await handle.stat()
      created.push({ path: file.path, handle, inode: info.ino, device: info.dev })
    }
    for (const file of created) {
      await file.handle.writeFile(files.find(item => item.path === file.path)!.content)
    }
  }
  catch (error) {
    for (const file of created) {
      const info = await lstat(file.path).catch(() => undefined)
      if (info?.ino === file.inode && info.dev === file.device) {
        await unlink(file.path)
      }
    }
    throw error
  }
  finally {
    await Promise.all(created.map(file => file.handle.close()))
  }
  return { schemaVersion: 1, dryRun, files: files.map(({ content: _content, ...file }) => file) }
}

export function registerSnapshotWorkflow(snapshot: Command, cwd: string) {
  snapshot.command('workflow')
    .description(localize('Export the approved builder and independent trusted publisher workflows', '导出审批构建与独立可信发布工作流'))
    .requiredOption('--out <directory>', localize('Workflow directory; existing different files are protected', '工作流目录；保护已有的不同内容文件'))
    .option('--pnpm-version <version>', localize('Exact trusted pnpm 12 version matching packageManager', '与 packageManager 一致的可信 pnpm 12 精确版本'), '12.14.0')
    .option('--environment <name>', localize('Protected builder approval environment', '受保护的构建审批环境'))
    .option('--builder-workflow <path>', localize('Repository-relative builder workflow filename', '仓库相对的构建工作流文件路径'))
    .option('--publisher-workflow <path>', localize('Repository-relative trusted publisher filename', '仓库相对的可信发布工作流文件路径'))
    .option('--builder-name <name>', localize('Builder name matched by workflow_run', 'workflow_run 匹配的构建工作流名称'))
    .option('--publisher-name <name>', localize('Publisher workflow display name', '发布工作流显示名称'))
    .option('--dry-run', localize('Preview both workflows without writing files', '预览两份工作流，不写入文件'))
    .option('--json', localize('Output a versioned JSON report', '输出有版本结构的 JSON 报告'))
    .action(async (options: { out: string, dryRun?: boolean, json?: boolean, pnpmVersion: string, environment?: string, builderWorkflow?: string, publisherWorkflow?: string, builderName?: string, publisherName?: string }) => {
      const report = await exportWorkflows(path.resolve(cwd, options.out), options.dryRun ?? false, {
        pnpmVersion: options.pnpmVersion,
        ...(options.environment !== undefined && { environment: options.environment }),
        ...(options.builderWorkflow !== undefined && { builderWorkflowPath: options.builderWorkflow }),
        ...(options.publisherWorkflow !== undefined && { publisherWorkflowPath: options.publisherWorkflow }),
        ...(options.builderName !== undefined && { builderWorkflowName: options.builderName }),
        ...(options.publisherName !== undefined && { publisherWorkflowName: options.publisherName }),
      })
      await writeSnapshotOutput(report, options.json ? { json: true } : {}, report.files.map(file => `${file.status}: ${file.path}`).join('\n'))
    })
}
