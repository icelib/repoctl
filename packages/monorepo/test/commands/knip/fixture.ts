import { spawnSync } from 'node:child_process'
import { mkdir, readFile, realpath, symlink, writeFile } from 'node:fs/promises'
import process from 'node:process'
import path from 'pathe'
import { fixture as dependencyFixture, snapshot, writeJson } from '../deps/fixture'

export { snapshot, writeJson }
const cli = path.resolve(import.meta.dirname, '../../../bin/repoctl.js')
const installedKnip = path.resolve(import.meta.dirname, '../../../node_modules/knip')

export async function fixture(options: { tool?: boolean, config?: object } = {}) {
  const h = await dependencyFixture({
    '.': { scripts: { audit: 'knip' }, devDependencies: { knip: '6.39.0' } },
    'packages/app': { name: '@fixture/app', dependencies: { 'unused-package': '1.0.0' } },
  })
  await mkdir(path.join(h.workspace, 'node_modules'), { recursive: true })
  if (options.tool !== false) {
    await symlink(await realpath(installedKnip), path.join(h.workspace, 'node_modules/knip'), 'junction')
  }
  await writeFile(path.join(h.workspace, '.gitignore'), 'node_modules/\ndist/\n')
  await writeJson(path.join(h.workspace, 'knip.json'), options.config ?? {
    workspaces: { '.': {}, 'packages/*': { entry: ['src/main.ts'], project: ['src/**/*.ts'] } },
  })
  await mkdir(path.join(h.workspace, 'packages/app/src'), { recursive: true })
  await writeFile(path.join(h.workspace, 'packages/app/src/main.ts'), 'import { used } from "./util"\nimport "missing-package"\nconsole.log(used)\n')
  await writeFile(path.join(h.workspace, 'packages/app/src/util.ts'), 'export const used = 1\nexport const unused = 2\n')
  await writeFile(path.join(h.workspace, 'packages/app/src/orphan.ts'), 'export const orphan = 3\n')
  return h
}

export function runCli(h: Awaited<ReturnType<typeof fixture>>, args: string[], cwd = h.workspace) {
  return spawnSync(process.execPath, [cli, '--lang', 'en', 'check', ...args], {
    cwd,
    encoding: 'utf8',
    timeout: 30_000,
    env: { ...process.env, HOME: h.home, USERPROFILE: h.home, NODE_ENV: 'production', NO_COLOR: '1' },
  })
}

export async function json(file: string) {
  return JSON.parse(await readFile(file, 'utf8'))
}

export async function fakeTool(workspace: string, script: string, version = '6.39.0') {
  const directory = path.join(workspace, 'node_modules/knip')
  await mkdir(directory, { recursive: true })
  await writeJson(path.join(directory, 'package.json'), { name: 'knip', version, bin: 'cli.cjs' })
  await writeFile(path.join(directory, 'cli.cjs'), script)
}

export function nativePayload(overrides: object = {}) {
  return { schemaVersion: 1, kind: 'repoctl-knip-native', cwd: '', hasConfigLoadErrors: false, workspaces: ['.', 'packages/app'], configFilePath: null, report: { exports: true }, plugins: {}, findings: [], ...overrides }
}

export function emitPayload(payload = nativePayload(), exitCode = 0) {
  return `const payload = ${JSON.stringify(payload)}; payload.cwd = process.cwd(); console.log('__REPOCTL_KNIP_REPORT_V1__' + JSON.stringify(payload)); process.exitCode = ${exitCode};`
}
