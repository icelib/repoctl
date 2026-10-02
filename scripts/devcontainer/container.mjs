import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { repoRoot } from '../packaged-template/workspace.mjs'

export function containerHarness(workspace, packDirectory) {
  const runId = `repoctl-devcontainer-${randomUUID()}`
  const label = `repoctl.acceptance=${runId}`
  const logDirectory = path.join(workspace, '../logs')
  mkdirSync(logDirectory)
  let step = 0
  function run(command, args, allowFailure = false) {
    const filename = path.join(logDirectory, `${String(++step).padStart(2, '0')}-${command}.log`)
    try {
      const result = execFileSync(command, args, {
        encoding: 'utf8',
        cwd: repoRoot,
        env: { ...process.env, CI: 'true', HUSKY: '0', TURBO_TELEMETRY_DISABLED: '1' },
        timeout: 600_000,
        maxBuffer: 12 * 1024 * 1024,
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      writeFileSync(filename, result)
      return { status: 0, output: result }
    }
    catch (error) {
      const output = `${error.stdout ?? ''}\n${error.stderr ?? ''}`
      writeFileSync(filename, output)
      if (allowFailure) {
        return { status: error.status ?? 1, output }
      }
      throw new Error(`${command} ${args.join(' ')} failed; ${filename}\n${output}`, { cause: error })
    }
  }
  const docker = (args, allowFailure) => run('docker', args, allowFailure)
  const existingImages = new Set(docker(['image', 'ls', '--quiet', '--no-trunc']).output.trim().split(/\s+/u))
  const devcontainer = args => run('pnpm', ['dlx', '@devcontainers/cli@0.89.0', ...args])
  const ids = () => docker(['ps', '--all', '--quiet', '--filter', `label=${label}`]).output.trim().split(/\s+/u).filter(Boolean)
  let containerId
  return {
    start() {
      assert.deepEqual(ids(), [])
      console.log(`Starting Dev Container ${runId}; logs: ${logDirectory}`)
      devcontainer(['up', '--workspace-folder', workspace, '--id-label', label, '--mount', `type=bind,source=${packDirectory},target=/repoctl-packs`, '--remote-env', 'CI=true', '--remote-env', 'HUSKY=0', '--remote-env', 'TURBO_TELEMETRY_DISABLED=1'])
      const containers = ids()
      assert.equal(containers.length, 1)
      containerId = containers[0]
      return JSON.parse(docker(['inspect', containerId]).output)[0]
    },
    exec(args) {
      return devcontainer(['exec', '--workspace-folder', workspace, '--id-label', label, ...args]).output
    },
    expectFailure(args) {
      assert.ok(containerId)
      const result = run('pnpm', ['dlx', '@devcontainers/cli@0.89.0', 'exec', '--workspace-folder', workspace, '--id-label', label, ...args], true)
      assert.notEqual(result.status, 0)
      return result.output
    },
    cleanup() {
      const images = new Set()
      const volumes = new Set()
      for (const id of ids()) {
        const info = JSON.parse(docker(['inspect', id]).output)[0]
        // Only containers selected by this unpredictable label belong to this run.
        assert.equal(info.Config.Labels['repoctl.acceptance'], runId)
        images.add(info.Image)
        for (const mount of info.Mounts) {
          if (mount.Type === 'volume' && mount.Destination === '/home/node/.local/share/pnpm/store') {
            volumes.add(mount.Name)
          }
        }
        docker(['rm', '--force', id])
      }
      for (const volume of volumes) {
        docker(['volume', 'rm', volume])
      }
      for (const image of images) {
        // Refuse deletion if another container references the same image.
        if (!existingImages.has(image) && !docker(['ps', '--all', '--quiet', '--filter', `ancestor=${image}`]).output.trim()) {
          docker(['image', 'rm', image], true)
        }
      }
      assert.deepEqual(ids(), [])
    },
  }
}
