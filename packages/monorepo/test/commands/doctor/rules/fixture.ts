import { spawnSync } from 'node:child_process'
import { readdir, readFile } from 'node:fs/promises'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import path from 'pathe'
import fs from '@/utils/fs'
import { createTempWorkspace } from '../helpers'

export async function fixture(manifest: Record<string, unknown> = {}) {
  const root = await createTempWorkspace('doctor rules ')
  await fs.outputJson(path.join(root, 'package.json'), { name: 'doctor-rules', private: true, ...manifest }, { spaces: 2 })
  await fs.outputFile(path.join(root, 'pnpm-workspace.yaml'), 'packages: [packages/*]\n')
  await fs.outputJson(path.join(root, 'packages/app/package.json'), { name: 'app', private: true })
  return { root, cwd: path.join(root, 'packages/app') }
}

export function cli(cwd: string, args: string[]) {
  return spawnSync(process.execPath, [fileURLToPath(new URL('../../../../bin/repoctl.js', import.meta.url)), '--lang', 'en', 'doctor', ...args], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, CI: 'true', NODE_ENV: 'production', TEST: undefined, CONSOLA_LEVEL: '3' },
    timeout: 30000,
  })
}

export async function contents(root: string): Promise<Record<string, string>> {
  const result: Record<string, string> = {}
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const target = path.join(root, entry.name)
    if (entry.isDirectory()) {
      for (const [name, content] of Object.entries(await contents(target))) {
        result[`${entry.name}/${name}`] = content
      }
    }
    else {
      result[entry.name] = await readFile(target, 'utf8')
    }
  }
  return result
}
