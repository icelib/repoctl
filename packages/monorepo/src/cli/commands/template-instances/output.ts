import process from 'node:process'
import { findWorkspaceDir } from '@pnpm/find-workspace-dir'
import path from 'pathe'
import fs from '../../../utils/fs'

export interface OutputOptions { json?: boolean, out?: string }

export async function templateWorkspaceRoot() {
  return await findWorkspaceDir(process.cwd()) ?? process.cwd()
}

export async function emitTemplateReport(value: unknown, options: OutputOptions) {
  const content = JSON.stringify(value, null, 2)
  if (options.out) {
    await fs.outputFile(path.resolve(options.out), `${content}\n`)
  }
  else {
    process.stdout.write(`${content}\n`)
  }
}
