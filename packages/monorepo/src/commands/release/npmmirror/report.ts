import type { SyncResult } from './types'
import { appendFile } from 'node:fs/promises'
import process from 'node:process'
import { logger } from '../../../core/logger'

export function retryCommand(result: SyncResult) {
  const version = result.versions.length === 1 ? ` --version ${result.versions[0]}` : ''
  return `pnpm exec repo release sync-npmmirror --package ${result.name}${version}`
}

function annotation(message: string) {
  return message.replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A')
}

function cell(value: string) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('|', '&#124;').replaceAll('\r', ' ').replaceAll('\n', ' ')
}

export async function reportSync(results: SyncResult[], env: NodeJS.ProcessEnv, dryRun = false, error?: string) {
  if (!results.length && !error) {
    logger.info('No published npm packages; skipping npmmirror sync.')
  }
  for (const result of results) {
    const message = `npmmirror ${result.state}: ${result.name}@${result.versions.join(', ') || '(dist-tags)'}${result.taskId ? ` (task ${result.taskId})` : ''}`
    if (result.state === 'failed') {
      logger.warn(`${message}: ${result.error}\nRetry: ${retryCommand(result)}`)
      if (env['GITHUB_ACTIONS'] === 'true') {
        process.stdout.write(`::warning::${annotation(`${message}: ${result.error}`)}\n`)
      }
    }
    else {
      logger.info(`${message}${result.error ? `: ${result.error}` : ''}`)
    }
  }
  if (error) {
    logger.error(error)
    if (env['GITHUB_ACTIONS'] === 'true') {
      process.stdout.write(`::warning::${annotation(`npmmirror: ${error}`)}\n`)
    }
  }
  if (!env['GITHUB_STEP_SUMMARY'] || dryRun) {
    return
  }
  const rows = results.map(result => `| ${cell(result.name)} | ${cell(result.versions.join(', '))} | ${result.state} | ${cell(result.taskId ?? '')} | ${cell(result.error ?? '')} |`)
  const retries = results.filter(result => result.state === 'failed').map(result => `- \`${retryCommand(result)}\``)
  await appendFile(env['GITHUB_STEP_SUMMARY'], [
    '',
    '### npmmirror sync',
    '',
    ...(error ? [cell(error), ''] : []),
    ...(rows.length
      ? ['| Package | Versions | Result | Task ID | Details |', '| --- | --- | --- | --- | --- |', ...rows]
      : ['No published npm packages.']),
    '',
    ...retries,
    '',
  ].join('\n'))
}
