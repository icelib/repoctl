import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const prompts = vi.hoisted(() => ({ select: vi.fn(), input: vi.fn() }))
vi.mock('@icebreakers/monorepo-templates', async original => ({
  ...await original<typeof import('@icebreakers/monorepo-templates')>(),
  ...prompts,
}))

const tty = Object.getOwnPropertyDescriptor(process.stdin, 'isTTY')
const outputTty = Object.getOwnPropertyDescriptor(process.stdout, 'isTTY')
let root: string

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'repoctl-docs-create-'))
  prompts.select.mockReset().mockResolvedValue('docs-site')
  prompts.input.mockReset().mockResolvedValue('docs')
  Object.defineProperty(process.stdin, 'isTTY', { configurable: true, value: true })
  Object.defineProperty(process.stdout, 'isTTY', { configurable: true, value: true })
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
  if (tty) {
    Object.defineProperty(process.stdin, 'isTTY', tty)
  }
  else {
    Reflect.deleteProperty(process.stdin, 'isTTY')
  }
  if (outputTty) {
    Object.defineProperty(process.stdout, 'isTTY', outputTty)
  }
  else {
    Reflect.deleteProperty(process.stdout, 'isTTY')
  }
})

describe('documentation creation', () => {
  it('creates Nimbus for the docs-site intent', async () => {
    const { runCreateFlow } = await import('@/cli/commands/package/create-flow')
    await runCreateFlow(root, 'guide')
    const pkg = JSON.parse(await readFile(path.join(root, 'apps/guide/package.json'), 'utf8'))
    expect(pkg.dependencies['@cloudflare/nimbus-docs']).toBe('0.16.0')
    expect(await readFile(path.join(root, 'apps/guide/src/content/docs/zh/index.mdx'), 'utf8')).toContain('欢迎')
  })

  it.each(['nimbus', 'vitepress', 'vue-lib'] as const)('normalizes explicit %s independently of intent defaults', async (template) => {
    const { runCreateFlow } = await import('@/cli/commands/package/create-flow')
    const out = path.join(root, 'plan.json')
    await runCreateFlow(root, 'guide', { template, dryRun: true, json: true, out })
    const plan = JSON.parse(await readFile(out, 'utf8'))
    expect(plan.template).toBe(template)
    expect(plan.targetName).toBe(`${template === 'vue-lib' ? 'packages' : 'apps'}/guide`)
    expect(prompts.select).not.toHaveBeenCalled()
    await expect(readFile(path.join(plan.targetDir, 'package.json'))).rejects.toThrow()
  })

  it('preserves nested destinations in noninteractive mode', async () => {
    Object.defineProperty(process.stdin, 'isTTY', { configurable: true, value: false })
    const { runCreateFlow } = await import('@/cli/commands/package/create-flow')
    const out = path.join(root, 'plan.json')
    await runCreateFlow(root, 'services/manual', { template: 'nimbus', dryRun: true, json: true, out })
    expect(JSON.parse(await readFile(out, 'utf8')).targetName).toBe('services/manual')
    expect(prompts.input).not.toHaveBeenCalled()
  })

  it('honors configured defaults and template destinations', async () => {
    await writeFile(path.join(root, 'repoctl.config.mjs'), `export default {
      commands: { create: { defaultTemplate: 'vitepress', templateMap: {
        vitepress: { source: 'vitepress', target: 'packages/website' }
      } } }
    }`)
    const { runCreateFlow } = await import('@/cli/commands/package/create-flow')
    const out = path.join(root, 'plan.json')
    await runCreateFlow(root, 'guide', { dryRun: true, json: true, out })
    const plan = JSON.parse(await readFile(out, 'utf8'))
    expect(plan.template).toBe('vitepress')
    expect(plan.targetName).toBe('packages/guide')
    expect(prompts.select).not.toHaveBeenCalled()
    await runCreateFlow(root, 'guide', { template: 'nimbus', dryRun: true, json: true, out })
    expect(JSON.parse(await readFile(out, 'utf8')).targetName).toBe('apps/guide')
  })
})
