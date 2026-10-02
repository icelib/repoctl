import type { ChildProcess } from 'node:child_process'
import type { PackageCheckCommand } from './types'
import { spawnSync } from 'node:child_process'
import process from 'node:process'
import spawn from 'cross-spawn'

function stop(child: ChildProcess) {
  if (!child.pid) {
    return
  }
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
    return
  }
  try {
    process.kill(-child.pid, 'SIGKILL')
  }
  catch {
    child.kill('SIGKILL')
  }
}

export async function execute(executable: string, args: string[], cwd: string, timeoutMs: number): Promise<PackageCheckCommand> {
  return new Promise((resolve) => {
    const child = spawn(executable, args, {
      cwd,
      detached: process.platform !== 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, CI: 'true', NODE_PATH: '', REPOCTL_PACKAGE_CHECK_RUNNING: '1' },
    })
    let output = ''
    let stdout = ''
    let stderr = ''
    let failed = false
    const append = (chunk: unknown) => {
      output = `${output}${String(chunk)}`.slice(-4 * 1024 * 1024)
    }
    const onExit = () => stop(child)
    process.once('exit', onExit)
    const timer = setTimeout(() => {
      failed = true
      append(`\nCommand timed out after ${timeoutMs}ms.\n`)
      stop(child)
    }, timeoutMs)
    timer.unref()
    child.stdout?.setEncoding('utf8')
    child.stderr?.setEncoding('utf8')
    child.stdout?.on('data', (chunk) => {
      stdout = `${stdout}${String(chunk)}`.slice(-4 * 1024 * 1024)
      append(chunk)
    })
    child.stderr?.on('data', (chunk) => {
      stderr = `${stderr}${String(chunk)}`.slice(-4 * 1024 * 1024)
      append(chunk)
    })
    child.once('error', (error) => {
      failed = true
      append(`\n${error.message}\n`)
    })
    child.once('close', (code) => {
      clearTimeout(timer)
      process.removeListener('exit', onExit)
      resolve({ cwd, executable, args, exitCode: failed ? null : code, output, stdout, stderr })
    })
  })
}

export function failureMessage(command: PackageCheckCommand) {
  return `${command.executable} ${command.args.join(' ')} failed (${command.exitCode ?? 'process error'}): ${command.output}`
}
