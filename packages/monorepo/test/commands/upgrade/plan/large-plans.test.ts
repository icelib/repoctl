import { Buffer } from 'node:buffer'
import { readFile } from 'node:fs/promises'
import { planUpgrade } from '@icebreakers/monorepo'
import path from 'pathe'
import { expect, it } from 'vitest'
import { fixture } from './fixture'
import { instrument } from './instrument'

it('passes complete reviewed plans to the child process beyond OS argument limits', async () => {
  const h = await fixture()
  const targets = ['.editorconfig', 'Dockerfile']
  for (const filename of targets) {
    await h.write(filename, `${'# local customization '.repeat(9000)}\n`)
  }
  const plan = await planUpgrade({ cwd: h.cwd, targets, overwrite: true })
  expect(plan.status).toBe('ready')
  expect(JSON.stringify(plan).length).toBeGreaterThan(262144)
  expect(await instrument(plan, '')).toBe('applied')
  for (const file of plan.files) {
    expect(await readFile(path.join(h.cwd, file.path))).toEqual(Buffer.from(file.content!, 'base64'))
  }
})
