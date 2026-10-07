import { access, readFile, writeFile } from 'node:fs/promises'
import path from 'pathe'
import { createNewProject, planDevContainer, resolveTemplateCatalog } from 'repoctl'
import { expect, it } from 'vitest'
import { cli, fixture, snapshot } from './fixture'

it.each(['root', 'leaf'] as const)('rejects invalid %s configuration before saving or applying a Dev Container plan', async (location) => {
  const h = await fixture()
  const saved = path.join(h.parent, 'reviewed-plan.json')
  const output = path.join(h.parent, 'new-plan.json')
  await writeFile(saved, JSON.stringify(await planDevContainer(h.root)))
  await writeFile(path.join(h[location], 'repoctl.config.mjs'), 'export default { commands: { create: { parameters: { password: "private-parameter-value" } } } }')
  const before = await snapshot(h.root)

  for (const args of [['--out', output, '--json'], ['--apply', saved, '--json']]) {
    const result = cli(h.leaf, args)
    expect(result.status).toBe(1)
    expect(JSON.parse(result.stderr)).toMatchObject({
      valid: false,
      diagnostics: expect.arrayContaining([expect.objectContaining({ path: 'commands.create.parameters', id: 'config.unknown-field' })]),
    })
    expect(result.stderr).not.toContain('private-parameter-value')
  }

  await expect(access(output)).rejects.toThrow()
  await expect(access(path.join(h.root, '.devcontainer'))).rejects.toThrow()
  expect(await snapshot(h.root)).toEqual(before)
})

it('creates a Next application from configured catalog defaults and applies Dev Container files only at the workspace root', async () => {
  const h = await fixture()
  await writeFile(path.join(h.root, 'pnpm-workspace.yaml'), 'packages: [packages/*, apps/*]\n')
  await writeFile(path.join(h.root, 'repoctl.config.mjs'), 'export default { commands: { create: { defaultTemplate: "next" } } }')
  const catalog = await resolveTemplateCatalog({ cwd: h.root })
  expect(catalog.diagnostics).toEqual([])
  expect(catalog.entries.map(entry => entry.key)).toEqual(expect.arrayContaining(['next', 'react-lib']))
  await createNewProject({ cwd: h.root, name: 'apps/portal' })
  const application = path.join(h.root, 'apps/portal')
  const manifest = JSON.parse(await readFile(path.join(application, 'package.json'), 'utf8'))
  expect(manifest.dependencies.next).toBe('16.4.0')
  expect(manifest.scripts.typecheck).toContain('next typegen')
  await expect(access(path.join(application, 'src/app/api/health/route.ts'))).resolves.toBeUndefined()

  const before = await snapshot(application)
  const saved = path.join(h.parent, 'next-container-plan.json')
  const preview = cli(application, ['--json', '--out', saved])
  expect(preview.status, preview.stderr).toBe(0)
  const plan = JSON.parse(preview.stdout)
  expect(plan).toMatchObject({ workspaceDir: h.root, status: 'ready', packageManager: h.manifest.packageManager })
  expect(plan.files).toHaveLength(4)
  await expect(access(path.join(h.root, '.devcontainer'))).rejects.toThrow()

  const applied = cli(application, ['--apply', saved, '--json'])
  expect(applied.status, applied.stderr).toBe(0)
  expect(JSON.parse(applied.stdout)).toMatchObject({ status: 'applied', workspaceDir: h.root })
  const config = JSON.parse(await readFile(path.join(h.root, '.devcontainer/devcontainer.json'), 'utf8'))
  expect(config.postCreateCommand).toEqual(['node', '.devcontainer/setup.mjs'])
  expect(await snapshot(application)).toEqual(before)
  await expect(access(path.join(application, '.devcontainer'))).rejects.toThrow()
  const repeated = cli(application, ['--apply', saved, '--json'])
  expect(repeated.status, repeated.stderr).toBe(0)
  expect(JSON.parse(repeated.stdout).status).toBe('unchanged')
})
