import type { ChildProcess } from 'node:child_process'
import { spawn } from 'node:child_process'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

export const cli = fileURLToPath(new URL('../../../dist/cli.mjs', import.meta.url))

export async function fixture(scripts: Record<string, string>) {
  const cwd = await mkdtemp(path.join(tmpdir(), 'repo-check-report-'))
  const { packageManager } = JSON.parse(await readFile(new URL('../../../../../package.json', import.meta.url), 'utf8'))
  await writeFile(path.join(cwd, 'package.json'), JSON.stringify({ private: true, packageManager, scripts }))
  return cwd
}

export function startCli(cwd: string, args: string[]) {
  const child = spawn(process.execPath, [cli, 'check', ...args], { cwd, stdio: ['ignore', 'pipe', 'pipe'] })
  let stdout = ''
  let stderr = ''
  child.stdout.on('data', chunk => stdout += chunk)
  child.stderr.on('data', chunk => stderr += chunk)
  const result = new Promise<{ code: number | null, stdout: string, stderr: string }>((resolve, reject) => {
    child.on('error', reject)
    child.on('close', code => resolve({ code, stdout, stderr }))
  })
  return { child, result }
}

export function waitForOutput(child: ChildProcess, marker: string) {
  return new Promise<void>((resolve, reject) => {
    let output = ''
    let timer: ReturnType<typeof setTimeout>
    function finish(error?: Error) {
      clearTimeout(timer)
      if (error) {
        reject(error)
      }
      else {
        resolve()
      }
    }
    function onData(chunk: unknown) {
      output += String(chunk)
      if (output.includes(marker)) {
        finish()
      }
    }
    function onClose() {
      finish(new Error(`CLI closed before ${marker}: ${output}`))
    }
    timer = setTimeout(() => finish(new Error(`Missing output: ${marker}`)), 15000)
    child.stdout?.on('data', onData)
    child.once('close', onClose)
  })
}
