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
  const child = spawn(process.execPath, [cli, 'check', ...args], { cwd, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'] })
  let stdout = ''
  let stderr = ''
  child.stdout.on('data', chunk => stdout += chunk)
  child.stderr.on('data', chunk => stderr += chunk)
  const result = new Promise<{ code: number | null, stdout: string, stderr: string }>((resolve, reject) => {
    child.on('error', reject)
    child.on('close', code => resolve({ code, stdout, stderr }))
  })
  async function waitForExit(timeoutMs = 15_000) {
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      return await Promise.race([result, new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`CLI did not close: ${JSON.stringify({ pid: child.pid, exitCode: child.exitCode, signalCode: child.signalCode, stdout, stderr })}`)), timeoutMs)
      })])
    }
    finally {
      clearTimeout(timer)
    }
  }
  async function stop(ownedPids: number[] = []) {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGTERM')
    }
    try {
      await waitForExit(3500)
    }
    catch {
      // The test-created script may still own the outer CLI's output pipes.
      // Its PID is read from this fixture's own marker, never a name-based search.
      for (const pid of ownedPids) {
        try {
          process.kill(pid, 'SIGKILL')
        }
        catch {}
      }
      if (child.pid) {
        try {
          process.kill(process.platform === 'win32' ? child.pid : -child.pid, 'SIGKILL')
        }
        catch {}
      }
      child.stdout.destroy()
      child.stderr.destroy()
      await waitForExit(1000)
    }
  }
  return { child, result, waitForExit, stop }
}

export function waitForOutput(child: ChildProcess, marker: string, timeoutMs = 15_000) {
  return new Promise<void>((resolve, reject) => {
    let output = ''
    let settled = false
    let timer: ReturnType<typeof setTimeout>
    function finish(error?: Error) {
      if (settled) {
        return
      }
      settled = true
      clearTimeout(timer)
      child.stdout?.off('data', onData)
      child.off('close', onClose)
      child.off('error', finish)
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
    timer = setTimeout(() => finish(new Error(`Missing output: ${marker}; exitCode=${child.exitCode}; signal=${child.signalCode}; output=${output}`)), timeoutMs)
    child.stdout?.on('data', onData)
    child.once('close', onClose)
    child.once('error', finish)
  })
}
