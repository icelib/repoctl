import { spawnSync } from 'node:child_process'
import process from 'node:process'
import path from 'pathe'
import { expect, it } from 'vitest'
import { fixture } from './fixture'

const entry = path.resolve(import.meta.dirname, '../../../bin/repoctl.js')

it('emits parseable JSON for discovery, preview and apply under CI', async () => {
  const h = await fixture()
  const cli = (...args: string[]) => {
    const result = spawnSync(process.execPath, [entry, '--lang', 'en', 'tooling', 'capability', ...args, '--json'], { cwd: h.root, encoding: 'utf8', env: { ...process.env, CI: 'true', NO_COLOR: '1', NODE_ENV: 'production' }, timeout: 30000 })
    expect(result.status, result.stderr).toBe(0)
    return JSON.parse(result.stdout)
  }
  expect(cli('list')).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'playwright' }), expect.objectContaining({ id: 'storybook' })]))
  const plan = cli('plan', 'playwright', '--target', 'web', '--route', '/', '--role', 'button', '--name', 'Increment', '--expect-text', 'Count: 1')
  expect(plan.status).toBe('ready')
  await h.write('plan.json', JSON.stringify(plan))
  expect(cli('apply', 'plan.json').status).toBe('applied')
  expect(cli('apply', 'plan.json').status).toBe('unchanged')
})
