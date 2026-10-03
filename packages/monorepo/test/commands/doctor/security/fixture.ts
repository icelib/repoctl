import { spawnSync } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import process from 'node:process'
import path from 'pathe'
import { afterEach, vi } from 'vitest'
import { fixture } from '../../deps/fixture'

export { snapshot } from '../../deps/fixture'

afterEach(() => vi.unstubAllEnvs())

export async function securityFixture(yaml = '', version = '12.8.1') {
  const h = await fixture({ '.': { packageManager: `pnpm@${version}` } })
  vi.stubEnv('HOME', h.home)
  vi.stubEnv('USERPROFILE', h.home)
  vi.stubEnv('XDG_CONFIG_HOME', path.join(h.home, 'config'))
  vi.stubEnv('npm_config_userconfig', path.join(h.home, '.npmrc'))
  await mkdir(path.join(h.home, 'config/pnpm'), { recursive: true })
  await writeFile(path.join(h.workspace, 'pnpm-workspace.yaml'), `packages: [packages/*]\n${yaml}`)
  return h
}

export function securityCli(h: Awaited<ReturnType<typeof securityFixture>>, args: string[], lang = 'en') {
  return spawnSync(process.execPath, [path.resolve(import.meta.dirname, '../../../../bin/repoctl.js'), '--lang', lang, 'doctor', 'security', ...args], { cwd: h.workspace, encoding: 'utf8', timeout: 30_000, env: { ...process.env, NODE_ENV: 'production', NO_COLOR: '1' } })
}
