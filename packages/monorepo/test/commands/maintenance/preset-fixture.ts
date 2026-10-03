import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { applyOrganizationPresetAssets, getMaintenanceWorkflow, planOrganizationPresetAssets } from '@icebreakers/monorepo'
import { fixture, lockfile } from './fixture'

export const presetName = '@team/standards'
export const presetTarget = 'scripts/team-check.mjs'
export const presetSource = 'assets/check.mjs'
export const presetBytes = 'export const first = 1\nexport const second = 2\nexport const third = 3\nexport const fourth = 4\n'
export const presetPolicy = [{ packageName: presetName, source: presetSource, target: presetTarget }]

export async function presetFixture(options: { sameBytes?: boolean, conflict?: boolean, mixed?: boolean, mixedManifest?: boolean, extra?: boolean, duplicate?: boolean, lineEnding?: 'crlf', attributes?: boolean } = {}) {
  const h = await fixture()
  const sourceBytes = options.lineEnding === 'crlf' ? presetBytes.replaceAll('\n', '\r\n') : presetBytes
  const json = async (filename: string, value: unknown) => h.write(filename, `${JSON.stringify(value, null, 2)}\n`)
  const commit = (message: string) => {
    h.git(['add', '.'])
    h.git(['-c', 'commit.gpgsign=false', 'commit', '-qm', message])
    return h.git(['rev-parse', 'HEAD'])
  }
  const install = async (version: string, content: string, toolVersion: string) => {
    const manifest = JSON.parse(await readFile(path.join(h.cwd, 'package.json'), 'utf8'))
    manifest.devDependencies[presetName] = version
    manifest.devDependencies.repoctl = toolVersion
    await json('package.json', manifest)
    await json(`node_modules/${presetName}/package.json`, { name: presetName, version, exports: { '.': './entry.cjs' } })
    await h.write(`node_modules/${presetName}/entry.cjs`, 'throw new Error("preset code must not execute")\n')
    const assets = [{ source: presetSource, target: presetTarget }, ...(options.attributes ? [{ source: 'assets/attributes', target: '.gitattributes' }] : []), ...(version !== '1.0.0' && options.extra ? [{ source: 'assets/new.mjs', target: 'scripts/new-standard.mjs' }] : [])]
    await json(`node_modules/${presetName}/repoctl.preset.json`, { schemaVersion: 1, requires: { repoctl: '>=5 <6' }, assets })
    await h.write(`node_modules/${presetName}/${presetSource}`, content)
    if (options.attributes) {
      await h.write(`node_modules/${presetName}/assets/attributes`, `scripts/*.mjs ${version === '1.0.0' ? '-text' : 'text eol=crlf'}\n`)
    }
    await h.write(`node_modules/${presetName}/assets/new.mjs`, 'export const adopted = false\n')
    await h.write('repoctl.config.mjs', `export default ${JSON.stringify({ presets: Array.from({ length: options.duplicate ? 2 : 1 }, () => ({ packageName: presetName, version })), commands: { upgrade: { targets: options.mixedManifest ? ['package.json', '.editorconfig'] : ['.editorconfig'], mergeTargets: false } } })}\n`)
    await h.write('pnpm-lock.yaml', lockfile(toolVersion, `      '${presetName}':\n        specifier: ${version}\n        version: ${version}\n`))
  }
  await install('1.0.0', sourceBytes, options.mixed ? '0.1.0' : h.version)
  const plan = await planOrganizationPresetAssets(h.cwd)
  await applyOrganizationPresetAssets(plan)
  const baselinePath = plan.files.find(file => file.path === presetTarget)!.baseline!.path
  await h.write(presetTarget, sourceBytes.replace(options.conflict ? 'first = 1' : 'fourth = 4', options.conflict ? 'first = 99' : 'fourth = 40'))
  const workflow = await getMaintenanceWorkflow(h.cwd)
  const base = commit('adopt preset one')
  await install('2.0.0', options.sameBytes ? sourceBytes : sourceBytes.replace('first = 1', 'first = 10'), h.version)
  const head = commit('upgrade fixed preset')
  const expected = { ...h.expected, base, head, presetAssets: [...presetPolicy, ...(options.attributes ? [{ packageName: presetName, source: 'assets/attributes', target: '.gitattributes' }] : [])] }
  const request = async (route: string) => {
    const result = await h.request(route)
    return { data: { ...result.data, ...(route.endsWith('/branches/{branch}') ? { commit: { sha: head } } : {}), ...(route.endsWith('/actions/artifacts/{artifact_id}') ? { workflow_run: { id: 123, head_sha: head } } : {}) } }
  }
  return { ...h, base, head, expected, request, workflow, json, install, commit, baselinePath, options: { ...h.options, base, head } }
}
