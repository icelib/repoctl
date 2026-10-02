import { Buffer } from 'node:buffer'
import nativePath from 'node:path'
import { pathToFileURL } from 'node:url'
import { applyUpgradePlan, planUpgrade } from '@icebreakers/monorepo'
import path from 'pathe'
import { describe, expect, it } from 'vitest'
import { fixture, snapshot } from './fixture'

describe('configuration module refresh through built upgrades', () => {
  it('preserves functions imported from installed configuration packages', async () => {
    const h = await fixture()
    await h.write('node_modules/config-factory/package.json', '{"name":"config-factory","type":"module","exports":"./index.mjs"}')
    await h.write('node_modules/config-factory/index.mjs', 'export default function makeConfig(scripts) {return {commands:{upgrade:{targets:["package.json"],mergeTargets:false,scripts}}}}')
    await h.write('repoctl.config.mjs', 'import makeConfig from "config-factory"; export default () => makeConfig({verify:"echo external"})')
    const before = await snapshot(h.root)
    const plan = await planUpgrade({ cwd: h.cwd })
    expect(plan.status, JSON.stringify(plan.blockers)).toBe('ready')
    expect(Buffer.from(plan.files[0]!.content!, 'base64').toString()).toContain('echo external')
    expect(await snapshot(h.root)).toEqual(before)
  })

  it.each(['mjs', 'ts', 'cjs'])('refreshes local static and dynamic imports in %s while preserving module paths', async (extension) => {
    const h = await fixture()
    const commonjs = extension === 'cjs'
    const helper = `helpers/value.${commonjs ? 'cjs' : 'mjs'}`
    const localImport = commonjs ? `const { value, origin } = require('./${helper}')` : `import { value, origin } from './${helper}'`
    const config = `${localImport}; ${commonjs ? 'module.exports =' : 'export default'} async () => {
      const dynamic = await import('./helpers/dynamic.mjs')
      return {commands:{upgrade:{targets:['package.json'],mergeTargets:false,scripts:{verify:[value,dynamic.value,origin].join('|')}}}}
    }`
    const helperSource = (value: string) => commonjs
      ? `exports.value = '${value}'; exports.origin = [__filename, __dirname].join('|')`
      : `export const value = '${value}'; export const origin = [import.meta.url, import.meta.filename, import.meta.dirname].join('|')`
    await h.write(`repoctl.config.${extension}`, config)
    await h.write(helper, helperSource('before'))
    await h.write('helpers/dynamic.mjs', 'export const value = await Promise.resolve("dynamic-before")')
    const before = await snapshot(h.root)
    const first = await planUpgrade({ cwd: h.cwd })
    expect(first.status, JSON.stringify(first.blockers)).toBe('ready')
    const file = first.files.find(entry => entry.path === 'package.json')!
    const script = JSON.parse(Buffer.from(file.content!, 'base64').toString()).scripts.verify
    const helperPath = path.join(h.cwd, helper)
    const nativeHelperPath = nativePath.resolve(helperPath)
    expect(script).toBe(`before|dynamic-before|${commonjs ? '' : `${pathToFileURL(helperPath).href}|`}${nativeHelperPath}|${nativePath.dirname(nativeHelperPath)}`)
    const configInputs = first.inputs.filter(input => input.area === 'config').map(input => input.path)
    expect(configInputs).toEqual(expect.arrayContaining([helperPath, path.join(h.cwd, 'helpers/dynamic.mjs')]))
    expect(configInputs.every(filename => filename === path.normalize(filename))).toBe(true)
    expect(new Set(configInputs.map(filename => path.normalize(filename))).size).toBe(configInputs.length)
    expect(await snapshot(h.root)).toEqual(before)
    await h.write(helper, helperSource('after'))
    await h.write('helpers/dynamic.mjs', 'export const value = await Promise.resolve("dynamic-after")')
    const changed = await snapshot(h.root)
    const second = await planUpgrade({ cwd: h.cwd })
    expect(second.status, JSON.stringify(second.blockers)).toBe('ready')
    expect(Buffer.from(second.files.find(entry => entry.path === 'package.json')!.content!, 'base64').toString()).toContain('after|dynamic-after|')
    await expect(applyUpgradePlan(h.cwd, first)).rejects.toThrow('Upgrade conflicts')
    expect(await snapshot(h.root)).toEqual(changed)
  })
})
