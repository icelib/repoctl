import { readFile, rm } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { validateReleasePreparation } from 'repoctl'
import { afterEach, describe, expect, it } from 'vitest'
import YAML from 'yaml'
import { cliBin, repoRoot, run } from '../../../hooks/helpers'
import { fixture } from './fixture'

const directories: string[] = []

afterEach(async () => {
  await Promise.all(directories.splice(0).map(cwd => rm(cwd, { recursive: true, force: true })))
})

describe('combined consumer adoption through built repoctl entrypoints', () => {
  it('checks mixed staged tooling and nested code, then validates native fixed-group prerelease preparation', async () => {
    const data = await fixture({ root: true, lane: 'alpha' })
    directories.push(data.cwd)
    const rootManifest = JSON.parse(await readFile(path.join(data.cwd, 'package.json'), 'utf8'))
    const consumerPath = 'packages/nested/consumer/package.json'
    const consumerManifest = JSON.parse(await readFile(path.join(data.cwd, consumerPath), 'utf8'))
    await data.write('package.json', JSON.stringify({
      ...rootManifest,
      scripts: { ...rootManifest.scripts, typecheck: 'tsc -p tsconfig.tooling.json --noEmit && node record.cjs root' },
    }))
    await data.write(consumerPath, JSON.stringify({
      ...consumerManifest,
      scripts: { ...consumerManifest.scripts, typecheck: 'tsc -p tsconfig.json --noEmit && node ../../../record.cjs consumer' },
    }))
    await data.write('record.cjs', 'const fs = require("node:fs"); const path = require("node:path"); fs.appendFileSync(path.join(__dirname, "checks.log"), process.argv[2] + "\\n")\n')
    await data.write('.gitignore', 'checks.log\n')
    const compilerOptions = { types: [], skipLibCheck: true, target: 'ES2022', module: 'ESNext' }
    await data.write('tsconfig.tooling.json', JSON.stringify({ compilerOptions, include: ['repoctl.config.ts'] }))
    await data.write('packages/nested/consumer/tsconfig.json', JSON.stringify({ compilerOptions, include: ['src/index.ts'] }))
    await data.write('repoctl.config.ts', 'export default {}\n')
    await data.write('packages/nested/consumer/src/index.ts', 'export const value: number = 1\n')
    data.commit()

    await data.write('repoctl.config.ts', 'export default { tooling: {} }\n')
    await data.write('packages/nested/consumer/src/index.ts', 'export const value: number = 2\n')
    data.git('add', 'repoctl.config.ts', 'packages/nested/consumer/src/index.ts')
    const env = { ...data.env, PATH: `${path.join(repoRoot, 'node_modules/.bin')}${path.delimiter}${process.env['PATH'] ?? ''}` }
    const verify = () => run(path.join(data.cwd, 'packages/nested/consumer/src/..'), process.execPath, [cliBin, 'verify', 'staged-typecheck'], env)
    const checked = verify()
    expect(checked.status, checked.output).toBe(0)
    expect((await readFile(path.join(data.cwd, 'checks.log'), 'utf8')).trim().split('\n').sort()).toEqual(['consumer', 'root'])

    await data.write('packages/nested/consumer/src/index.ts', 'export const value: number = "invalid"\n')
    data.git('add', 'packages/nested/consumer/src/index.ts')
    const rejected = verify()
    expect(rejected.status, rejected.output).not.toBe(0)
    expect(rejected.output).toContain('TS2322')
    await data.write('packages/nested/consumer/src/index.ts', 'export const value: number = 2\n')
    const base = data.commit()
    const head = data.prepare()

    const report = await validateReleasePreparation({ ...data, base, head, policy: { branch: 'alpha' } })
    expect(report.errors).toEqual([])
    expect(report.status).toBe('valid')
    expect(report.packages).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'root-pkg', private: true, status: 'valid' }),
      expect.objectContaining({ name: 'consumer', directory: 'packages/nested/consumer', lane: 'alpha', status: 'valid' }),
    ]))
    const fixed = report.packages.filter(pkg => ['a', 'b'].includes(pkg.name))
    expect(fixed).toHaveLength(2)
    expect(new Set(fixed.map(pkg => pkg.newVersion)).size).toBe(1)
    expect(report.packages.filter(pkg => pkg.publishCandidate).every(pkg => pkg.lane === 'alpha' && pkg.newVersion.includes('-alpha.'))).toBe(true)
  }, 60000)

  it('rejects workspace patterns that can escape or misparse on any supported platform', async () => {
    const data = await fixture()
    directories.push(data.cwd)
    for (const pattern of ['C:/outside/**', 'C:relative/**', '!!/outside/**', '../outside/**', 'packages/\0/**', 'packages/\n/**']) {
      await data.write('pnpm-workspace.yaml', YAML.stringify({ packages: [pattern] }))
      const base = data.commit()
      const report = await validateReleasePreparation({ ...data, base, head: base, policy: { branch: 'main' } })
      expect(report.status, JSON.stringify(pattern)).toBe('invalid')
      expect(report.errors[0]?.detail, JSON.stringify(pattern)).toContain('isolated metadata tree')
    }
  }, 60000)
})
