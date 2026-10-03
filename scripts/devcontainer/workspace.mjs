import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import YAML from 'yaml'
import { createWorkspace, json, run } from '../packaged-template/workspace.mjs'

function removeInstalledDependencies(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue
    }
    const filename = path.join(directory, entry.name)
    if (entry.name === 'node_modules') {
      rmSync(filename, { recursive: true, force: true })
    }
    else {
      removeInstalledDependencies(filename)
    }
  }
}

export function prepareWorkspace(tempRoot) {
  const workspace = createWorkspace(tempRoot, ['react-vite', 'tsdown'])
  const rootManifest = json(path.join(workspace, 'package.json'))
  assert.equal(rootManifest.scripts['test:packaged-devcontainer'], undefined)
  assert.equal(existsSync(path.join(workspace, '.github/workflows/devcontainer.yml')), false)
  const planPath = path.join(tempRoot, 'devcontainer-plan.json')
  run('pnpm', ['exec', 'repo', 'tooling', 'devcontainer', '--json', '--out', planPath], workspace)
  const plan = json(planPath)
  assert.equal(plan.status, 'ready')
  assert.equal(existsSync(path.join(workspace, '.devcontainer')), false)
  run('pnpm', ['exec', 'repo', 'tooling', 'devcontainer', '--apply', planPath], workspace)
  const repeated = run('pnpm', ['exec', 'repo', 'tooling', 'devcontainer', '--apply', planPath, '--json'], workspace)
  assert.equal(JSON.parse(repeated).status, 'unchanged')

  const workspaceFile = path.join(workspace, 'pnpm-workspace.yaml')
  const config = YAML.parse(readFileSync(workspaceFile, 'utf8'))
  for (const [name, specifier] of Object.entries(config.overrides)) {
    if (specifier.startsWith('file:')) {
      config.overrides[name] = `file:/repoctl-packs/${path.basename(specifier.slice(5))}`
    }
  }
  writeFileSync(workspaceFile, YAML.stringify(config))
  removeInstalledDependencies(workspace)
  rmSync(path.join(workspace, 'pnpm-lock.yaml'))
  assert.equal(existsSync(path.join(workspace, 'node_modules')), false)
  return { workspace, plan, rootManifest }
}
