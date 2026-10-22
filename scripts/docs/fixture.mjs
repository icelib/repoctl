import { execFile } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { promisify } from 'node:util'
import YAML from 'yaml'
import { json, packDependencies, registry, repoRoot, run, writeJson } from '../packaged-template/workspace.mjs'

const exec = promisify(execFile)
export const previewWorkflow = '.github/workflows/repoctl-docs.yml'
export const reusableWorkflow = '.github/workflows/repoctl-docs-deploy.yml'
export const workflows = [previewWorkflow, reusableWorkflow]

export function fixture(root) {
  const packs = path.join(root, 'packs')
  const workspace = path.join(root, 'workspace')
  mkdirSync(packs)
  mkdirSync(path.join(workspace, 'packages/demo'), { recursive: true })
  console.log('Packing built repoctl and template artifacts without lifecycle rebuilds…')
  const previousIgnoreScripts = process.env.npm_config_ignore_scripts
  let overrides
  try {
    process.env.npm_config_ignore_scripts = 'true'
    overrides = packDependencies(packs)
  }
  finally {
    if (previousIgnoreScripts === undefined) {
      delete process.env.npm_config_ignore_scripts
    }
    else {
      process.env.npm_config_ignore_scripts = previousIgnoreScripts
    }
  }
  const packageManager = json(path.join(repoRoot, 'package.json')).packageManager
  writeJson(path.join(workspace, 'package.json'), {
    name: 'repoctl-packaged-docs-smoke',
    private: true,
    type: 'module',
    packageManager,
    dependencies: { repoctl: overrides.repoctl },
    scripts: {
      'docs:build': 'node unexpected.mjs',
      'docs:preview': 'node unexpected.mjs',
      'docs:stable': 'node unexpected.mjs',
    },
  })
  writeJson(path.join(workspace, 'packages/demo/package.json'), { name: '@smoke/demo', version: '1.0.0' })
  const sourceWorkspace = YAML.parse(readFileSync(path.join(repoRoot, 'pnpm-workspace.yaml'), 'utf8'))
  writeFileSync(path.join(workspace, 'pnpm-workspace.yaml'), YAML.stringify({
    packages: ['packages/*'],
    overrides: { ...sourceWorkspace.overrides, ...overrides },
  }))
  writeFileSync(path.join(workspace, '.gitignore'), 'node_modules/\n')
  writeFileSync(path.join(workspace, 'unexpected.mjs'), 'throw new Error("Planning must never execute build or deployment")\n')
  run('corepack', ['enable'], workspace)
  run('pnpm', ['install', '--ignore-scripts', '--registry', registry], workspace)
  const cli = path.join(workspace, 'node_modules/repoctl/bin/repo.js')
  const git = args => run('git', args, workspace).trim()
  git(['init', '-b', 'main'])
  git(['config', 'user.email', 'smoke@example.invalid'])
  git(['config', 'user.name', 'Repoctl smoke fixture'])
  git(['remote', 'add', 'origin', 'https://github.com/smoke/docs.git'])
  function configure(enabled) {
    const commands = { upgrade: { targets: workflows, mergeTargets: false } }
    if (enabled) {
      commands.docs = { sites: { guide: {
        packages: ['@smoke/demo'],
        buildScript: 'docs:build',
        patchPaths: ['docs/**/*.md'],
        preview: { deployScript: 'docs:preview', url: 'https://next.example.invalid' },
        stable: { deployScript: 'docs:stable', url: 'https://docs.example.invalid' },
      } } }
    }
    writeFileSync(path.join(workspace, 'repoctl.config.mjs'), `import { defineMonorepoConfig } from 'repoctl'\nexport default defineMonorepoConfig(${JSON.stringify({ commands })})\n`)
  }
  async function invoke(args, env = {}) {
    const { stdout } = await exec(process.execPath, [cli, ...args], {
      cwd: workspace,
      encoding: 'utf8',
      timeout: 120_000,
      env: { ...process.env, CI: 'true', LEFTHOOK: '0', ...env },
      maxBuffer: 16 * 1024 * 1024,
    })
    return JSON.parse(stdout)
  }
  return { workspace, configure, invoke, git }
}
