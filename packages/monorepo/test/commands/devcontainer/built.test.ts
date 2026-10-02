import { access, mkdir, readFile, symlink, writeFile } from 'node:fs/promises'
import process from 'node:process'
import { applyDevContainerPlan, planDevContainer } from '@icebreakers/monorepo'
import path from 'pathe'
import { describe, expect, it } from 'vitest'
import { cli, fixture, snapshot } from './fixture'

describe('Dev Container preset through the built API and CLI', () => {
  it('previews from a leaf without writes and creates only root configuration after review', async () => {
    const h = await fixture()
    const before = await snapshot(h.parent)
    const plan = await planDevContainer(h.leaf)
    expect(plan).toMatchObject({ workspaceDir: h.root, status: 'ready', nodeVersion: '24.21.0', image: 'node:24.21.0-bookworm', packageManager: 'pnpm@12.8.1' })
    expect(plan.files).toHaveLength(4)
    expect(plan.files.every(file => file.path.startsWith('.devcontainer/') && file.action === 'create')).toBe(true)
    expect(await snapshot(h.parent)).toEqual(before)
    expect(await applyDevContainerPlan(h.leaf, JSON.parse(JSON.stringify(plan)))).toMatchObject({ status: 'applied', workspaceDir: h.root })
    await expect(access(path.join(h.leaf, '.devcontainer'))).rejects.toThrow()
  })

  it('replays the saved plan without writes and keeps setup and container processes opt-in', async () => {
    const h = await fixture()
    const plan = await planDevContainer(h.root)
    await applyDevContainerPlan(h.root, plan)
    const before = await snapshot(h.root)
    expect(await applyDevContainerPlan(h.root, plan)).toMatchObject({ status: 'unchanged', files: [] })
    expect(await snapshot(h.root)).toEqual(before)
    const config = JSON.parse(await readFile(path.join(h.root, '.devcontainer/devcontainer.json'), 'utf8'))
    expect(config).toMatchObject({ remoteUser: 'node', containerUser: 'node', forwardPorts: [], postCreateCommand: ['node', '.devcontainer/setup.mjs'] })
    expect(config.mounts).toHaveLength(1)
    expect(config.mounts[0]).toContain('target=/home/node/.local/share/pnpm/store')
    expect(await readFile(path.join(h.root, '.devcontainer/Dockerfile'), 'utf8')).toContain('corepack@0.36.0')
  })

  it('preserves custom configuration and exposes its diff without creating companion files', async () => {
    const h = await fixture()
    await mkdir(path.join(h.root, '.devcontainer'))
    await writeFile(path.join(h.root, '.devcontainer/devcontainer.json'), '{"image":"my-team/image:1"}\n')
    const before = await snapshot(h.root)
    const plan = await planDevContainer(h.root)
    expect(plan.status).toBe('blocked')
    expect(plan.files.find(file => file.path.endsWith('devcontainer.json'))).toMatchObject({ action: 'preserve', diff: expect.stringContaining('my-team/image:1') })
    await expect(applyDevContainerPlan(h.root, plan)).rejects.toThrow('ready')
    expect(await snapshot(h.root)).toEqual(before)
  })

  it('preserves an alternate root configuration and rejects linked configuration directories', async () => {
    const h = await fixture()
    await writeFile(path.join(h.root, '.devcontainer.json'), '{}\n')
    expect((await planDevContainer(h.root)).status).toBe('blocked')
    const other = await fixture()
    const outside = path.join(other.parent, 'outside')
    await mkdir(outside)
    await symlink(outside, path.join(other.root, '.devcontainer'), process.platform === 'win32' ? 'junction' : 'dir')
    await expect(planDevContainer(other.root)).rejects.toThrow('Linked')
    await expect(access(path.join(outside, 'devcontainer.json'))).rejects.toThrow()
  })

  it('detects manifest drift, output collisions and tampered plans before applying', async () => {
    const h = await fixture()
    const plan = await planDevContainer(h.root)
    await expect(applyDevContainerPlan(h.root, { ...plan, nodeVersion: '22.23.3' })).rejects.toThrow('edited')
    await writeFile(path.join(h.root, 'package.json'), JSON.stringify({ ...h.manifest, name: 'changed' }))
    await expect(applyDevContainerPlan(h.root, plan)).rejects.toThrow('inputs changed')
    const fresh = await planDevContainer(h.root)
    await mkdir(path.join(h.root, '.devcontainer'))
    await writeFile(path.join(h.root, '.devcontainer/README.md'), 'my own notes')
    await expect(applyDevContainerPlan(h.root, fresh)).rejects.toThrow('targets changed')
    expect(await readFile(path.join(h.root, '.devcontainer/README.md'), 'utf8')).toBe('my own notes')
    await expect(access(path.join(h.root, '.devcontainer/devcontainer.json'))).rejects.toThrow()
  })

  it('chooses a compatible pinned Node and diagnoses unsupported runtime declarations', async () => {
    const h = await fixture({ engines: { node: '^22.13.0' } })
    expect((await planDevContainer(h.root)).nodeVersion).toBe('22.23.3')
    await expect(planDevContainer(h.root, { nodeVersion: '24.21.0' })).rejects.toThrow('engines.node')
    await expect(planDevContainer(h.root, { nodeVersion: '22.23.3+build' })).rejects.toThrow('exact stable')
    const unsupported = await fixture({ engines: { node: '<20' } })
    await expect(planDevContainer(unsupported.root)).rejects.toThrow('exact stable')
    const manager = await fixture({ packageManager: 'pnpm@latest' })
    await expect(planDevContainer(manager.root)).rejects.toThrow('exact stable pnpm')
  })

  it('keeps JSON stable across languages and applies a saved CLI plan without overwriting the plan file', async () => {
    const h = await fixture()
    const saved = path.join(h.parent, 'plan.json')
    const before = await snapshot(h.root)
    const english = cli(h.leaf, ['--json', '--out', saved])
    const chinese = cli(h.leaf, ['--json'], 'zh-CN')
    expect(english.status, english.stderr).toBe(0)
    expect(chinese.status, chinese.stderr).toBe(0)
    expect(JSON.parse(english.stdout)).toEqual(JSON.parse(chinese.stdout))
    expect(await snapshot(h.root)).toEqual(before)
    expect(cli(h.root, ['--out', saved]).status).not.toBe(0)
    const applied = cli(h.leaf, ['--apply', saved, '--json'])
    expect(applied.status, applied.stderr).toBe(0)
    expect(JSON.parse(applied.stdout).status).toBe('applied')
    expect(cli(h.root, ['--apply', saved, '--node-version', '24.21.0']).status).not.toBe(0)
    expect(JSON.parse(cli(h.root, ['--apply', saved, '--json']).stdout).status).toBe('unchanged')
  })
})
