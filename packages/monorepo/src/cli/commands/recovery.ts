import type { RecoverCreateTargetResult } from '../../commands'
import process from 'node:process'
import path from 'pathe'
import { recoverCreateTarget } from '../../commands'
import { logger } from '../../core/logger'
import { localize } from '../../i18n'
import fs from '../../utils/fs'

export interface RecoverCreateCliOptions {
  /** Preview recovery without changing target, staging, or workspace manifest files. */
  dryRun?: boolean
  /** Emit a machine-readable result; this also implies dry-run. */
  json?: boolean
  /** Write the result to a file; this also implies dry-run. */
  out?: string
}

export interface RunRecoverCreateResult {
  result: RecoverCreateTargetResult
  dryRun: boolean
}

function formatPath(cwd: string, target: string) {
  const relative = path.relative(cwd, target)
  return relative && relative !== '.' ? relative : target
}

function formatResult(result: RecoverCreateTargetResult, cwd: string) {
  const lines = [
    localize('Create recovery:', '创建恢复：'),
    localize(`  target: ${formatPath(cwd, result.targetDir)}`, `  目标目录：${formatPath(cwd, result.targetDir)}`),
    localize(`  status: ${result.status}`, `  状态：${result.status}`),
    localize(`  removed: ${result.removed.length ? result.removed.join(', ') : '(none)'}`, `  已移除：${result.removed.length ? result.removed.join('、') : '（无）'}`),
    localize(`  preserved: ${result.preserved.length ? result.preserved.join(', ') : '(none)'}`, `  已保留：${result.preserved.length ? result.preserved.join('、') : '（无）'}`),
    localize(`  target removed: ${result.targetRemoved}`, `  已移除目标目录：${result.targetRemoved}`),
    localize(`  staging removed: ${result.stagingRemoved}`, `  已移除临时目录：${result.stagingRemoved}`),
  ]
  if (result.manifest) {
    lines.push(
      localize(`  manifest: ${formatPath(cwd, result.manifest.path)}`, `  工作区清单：${formatPath(cwd, result.manifest.path)}`),
      localize(`  manifest status: ${result.manifest.status}`, `  清单状态：${result.manifest.status}`),
    )
    if (result.manifest.reason) {
      lines.push(localize(`  manifest reason: ${result.manifest.reason}`, `  清单原因：${result.manifest.reason}`))
    }
  }
  if (result.reason) {
    lines.push(localize(`  reason: ${result.reason}`, `  原因：${result.reason}`))
  }
  if (result.dryRun) {
    lines.push(localize('Dry run only; no files were written.', '仅执行预览；未写入文件。'))
  }
  return lines.join('\n')
}

function shouldFail(result: RecoverCreateTargetResult) {
  return result.status === 'active' || result.status === 'malformed' || result.status === 'missing'
}

/** Run explicit create recovery through the public recovery API. */
export async function runRecoverCreate(cwd: string, inputTarget: string, options: RecoverCreateCliOptions = {}): Promise<RunRecoverCreateResult> {
  const targetDir = path.resolve(cwd, inputTarget)
  const dryRun = Boolean(options.dryRun || options.json || options.out)
  const result = await recoverCreateTarget(targetDir, { dryRun })
  if (options.out) {
    const content = options.json ? JSON.stringify(result, null, 2) : formatResult(result, cwd)
    const outFile = path.resolve(cwd, options.out)
    await fs.outputFile(outFile, `${content}\n`, 'utf8')
    logger.success(localize(`Wrote ${path.relative(cwd, outFile)}`, `已写入 ${path.relative(cwd, outFile)}`))
  }
  else if (options.json) {
    logger.log(JSON.stringify(result, null, 2))
  }
  else {
    logger.log(formatResult(result, cwd))
  }

  if (shouldFail(result)) {
    process.exitCode = 1
  }
  return { result, dryRun }
}
