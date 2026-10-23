import type { UpgradeKeepDecision, UpgradePlan } from '@icebreakers/monorepo'
import { readFile } from 'node:fs/promises'
import { applyUpgradePlan, planUpgrade } from '@icebreakers/monorepo'
import path from 'pathe'
import YAML from 'yaml'
import { fixture } from '../plan/fixture'
import { instrument } from '../plan/instrument'

export const targets = ['pnpm-workspace.yaml']

export async function workspaceFixture() {
  const h = await fixture()
  // Adopt the real shipped template through its reviewed public API first.
  const initial = await planUpgrade({ cwd: h.cwd, targets })
  await applyUpgradePlan(h.cwd, initial)
  const workspace = YAML.parse(await readFile(path.join(h.cwd, 'pnpm-workspace.yaml'), 'utf8'))
  const version = workspace.overrides.vite as string
  const groups = [
    { name: 'taro', workspaces: ['packages/taro'], dependencies: ['vite'], reason: 'Taro requires Vite 4.' },
    { name: 'uni', workspaces: ['packages/uni'], dependencies: ['vite'], reason: 'DCloud requires Vite 5.', ignore: true },
  ]
  async function configure(keep: UpgradeKeepDecision[] = []) {
    await h.write('repoctl.config.mjs', `export default ${JSON.stringify({ commands: { deps: { groups }, upgrade: { targets, mergeTargets: false, keep } } })}`)
  }
  async function saveWorkspace() {
    await h.write('pnpm-workspace.yaml', YAML.stringify(workspace))
  }
  await configure()
  return { ...h, workspace, version, configure, saveWorkspace }
}

export function workspaceFile(plan: UpgradePlan) {
  return plan.files.find(file => file.path === 'pnpm-workspace.yaml')!
}

export function decisionFrom(plan: UpgradePlan, selector = 'vite'): UpgradeKeepDecision {
  const finding = workspaceFile(plan).workspacePolicy!.findings.find(item => item.path[1] === selector)!
  return { file: 'pnpm-workspace.yaml', path: finding.path, reason: 'Preserve framework dependency isolation.', upstreamHash: finding.upstreamHash, localHash: finding.localHash }
}

/** Change only reads in a child process, never mutate installed/shared template assets. */
export async function withUpstream(cwd: string, overrides: Record<string, unknown>) {
  const plan = await planUpgrade({ cwd, targets })
  const original = YAML.parse(await readFile(path.join(plan.assetDir, 'pnpm-workspace.yaml'), 'utf8'))
  original.overrides = overrides
  const text = YAML.stringify(original)
  const output = await instrument(plan, `
    const originalRead = fs.readFile
    fs.readFile = async (filename, ...args) => {
      const content = await originalRead(filename, ...args)
      return args[0] !== 'utf8' && path.resolve(filename) === path.resolve(plan.assetDir, 'pnpm-workspace.yaml')
        ? Buffer.from(${JSON.stringify(text)}) : content
    }
  `, `
    const { planUpgrade } = await import(entry)
    process.stdout.write(JSON.stringify(await planUpgrade({cwd: root, targets: ['pnpm-workspace.yaml']})))
  `)
  const result = JSON.parse(output.slice(0, -'applied'.length)) as UpgradePlan
  if (result.status === 'blocked') {
    throw new Error(JSON.stringify(result.blockers))
  }
  return result
}
