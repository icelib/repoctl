import process from 'node:process'
import { registerConfigPreflight, reportCliFailure } from './cli/config-preflight'
import program from './cli/program'

registerConfigPreflight(program, process.cwd())

// CLI 入口，解析命令行参数并执行对应子命令。
if (process.argv.length <= 2) {
  program.outputHelp()
}
else {
  program.parseAsync().catch(reportCliFailure)
}
