import type { CheckExecutionOptions } from '../../../commands/check/types'
import process from 'node:process'
import path from 'pathe'
import { runCheckWithReport } from '../../../commands/check/execute'
import { logger } from '../../../core/logger'
import { localize } from '../../../i18n'
import fs from '../../../utils/fs'
import { createCheckReportOutput } from './report'

export async function emitCheckExecutionReport(options: CheckExecutionOptions, reportFile: string, format: 'json' | 'markdown', redact?: boolean) {
  const controller = new AbortController()
  const onInterrupt = () => controller.abort('SIGINT')
  const onTerminate = () => controller.abort('SIGTERM')
  const outFile = path.resolve(options.cwd, reportFile)
  process.on('SIGINT', onInterrupt)
  process.on('SIGTERM', onTerminate)
  try {
    const report = await runCheckWithReport({ ...options, signal: controller.signal })
    await fs.outputFile(outFile, `${createCheckReportOutput(report, format, redact)}\n`, 'utf8')
    process.exitCode = report.exitCode
    logger.info(localize(`Wrote ${path.relative(options.cwd, outFile)}`, `已写入 ${path.relative(options.cwd, outFile)}`))
    if (report.status === 'success') {
      logger.success(localize('Checks finished.', '检查完成。'))
    }
  }
  finally {
    process.removeListener('SIGINT', onInterrupt)
    process.removeListener('SIGTERM', onTerminate)
  }
}
