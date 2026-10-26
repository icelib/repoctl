import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

export interface SnapshotOutputOptions {
  json?: boolean
  out?: string
}

export async function writeSnapshotOutput(value: unknown, options: SnapshotOutputOptions, summary: string) {
  const json = `${JSON.stringify(value, null, 2)}\n`
  if (options.out) {
    const file = path.resolve(options.out)
    await mkdir(path.dirname(file), { recursive: true })
    await writeFile(file, json, { flag: 'wx' })
  }
  process.stdout.write(options.json ? json : `${summary}\n`)
}

export function snapshotNumber(value: string | undefined, label: string): number {
  if (!value || !/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value))) {
    throw new Error(`${label} must be a positive safe integer.`)
  }
  return Number(value)
}

export function snapshotRepository(value?: string) {
  const repository = value ?? process.env['GITHUB_REPOSITORY']
  if (!repository || !/^[\w.-]+\/[\w.-]+$/.test(repository)) {
    throw new Error('Provide --repository <owner/repo> or GITHUB_REPOSITORY.')
  }
  return repository
}
