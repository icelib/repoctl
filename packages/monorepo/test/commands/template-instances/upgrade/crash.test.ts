import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { expect, it } from 'vitest'
// eslint-disable-next-line antfu/no-import-dist
import { listTemplateInstances, recoverTemplateUpgrade } from '../../../../dist/index.mjs'
import { originalCode, upgradeFixture, write } from './fixtures'

it.skipIf(process.platform === 'win32')('recovers a durable operation after its process exits before registry commit', async (t) => {
  const f = await upgradeFixture(t)
  await write(f.nextSource, 'templates/tsdown/src/index.ts', originalCode.replace('first = 1', 'first = 2'))
  const before = (await listTemplateInstances(f.cwd))[0]!.instance
  const script = path.join(f.root, 'crash.mjs')
  const entry = new URL('../../../../dist/index.mjs', import.meta.url).href
  await fs.writeFile(script, `
import fs from 'node:fs/promises'
import process from 'node:process'
import { applyTemplateUpgradePlan, planTemplateUpgrade } from ${JSON.stringify(entry)}
const rename = fs.rename.bind(fs)
fs.rename = async (from, to) => {
  if (String(to).endsWith('/.repoctl/template-instances.json')) process.kill(process.pid, 'SIGKILL')
  return rename(from, to)
}
await applyTemplateUpgradePlan(await planTemplateUpgrade(${JSON.stringify(f.options)}))
`)
  const child = spawn(process.execPath, [script], { cwd: f.cwd, stdio: 'pipe' })
  let output = ''
  child.stderr.on('data', chunk => output += String(chunk))
  const signal = await new Promise<NodeJS.Signals | null>((resolve, reject) => {
    child.once('error', reject)
    child.once('exit', (_code, exitSignal) => resolve(exitSignal))
  })
  expect(signal, output).toBe('SIGKILL')
  const preview = await recoverTemplateUpgrade(f.cwd, f.target)
  expect(preview.status).toBe('recoverable')
  expect(preview.registryStatus).toBe('before')
  expect(preview.files.some(file => file.state === 'after')).toBe(true)
  await expect(recoverTemplateUpgrade(f.cwd, f.target, true)).rejects.toThrow('registry is locked')
  const lock = path.join(f.cwd, '.repoctl/template-instances.lock')
  expect(await fs.readFile(lock, 'utf8')).toMatch(new RegExp(`^${child.pid}:`))
  // This owned child has exited; no active writer can still own its lock.
  await fs.unlink(lock)
  await recoverTemplateUpgrade(f.cwd, f.target, true)
  expect((await listTemplateInstances(f.cwd))[0]!.instance).toEqual(before)
  expect(await fs.readFile(path.join(f.targetDir, 'src/index.ts'), 'utf8')).toBe(originalCode)
})
