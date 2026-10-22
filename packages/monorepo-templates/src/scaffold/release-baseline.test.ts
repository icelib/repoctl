import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { access, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { assetsDir, scaffoldWorkspace } from '@icebreakers/monorepo-templates'
import { expect, it } from 'vitest'

it('records the published release upstream during fresh scaffolding, before consumer customization', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'repoctl-scaffold-baseline-'))
  const targetDir = path.join(root, 'project')
  try {
    await scaffoldWorkspace({ targetDir, afterScaffold: async () => {
      const workflow = path.join(targetDir, '.github/workflows/release.yml')
      await writeFile(workflow, (await readFile(workflow, 'utf8')).replace('name: Release', 'name: Team Release'))
    } })
    const files = await readdir(path.join(targetDir, '.repoctl/baselines/root'))
    const workflowPath = '.github/workflows/release.yml'
    const digest = (content: string | Buffer) => createHash('sha256').update(content).digest('hex')
    expect(files).toEqual([`${digest(workflowPath)}.json`])
    const baseline = JSON.parse(await readFile(path.join(targetDir, '.repoctl/baselines/root', files[0]!), 'utf8'))
    const upstream = await readFile(path.join(assetsDir, workflowPath))
    expect(baseline).toMatchObject({ schemaVersion: 1, path: workflowPath, source: { package: '@icebreakers/monorepo-templates', assetPath: workflowPath, hash: digest(upstream) }, upstream: { content: upstream.toString('base64'), hash: digest(upstream) } })
    expect(Buffer.from(baseline.upstream.content, 'base64').toString()).not.toContain('Team Release')
    expect(await readFile(path.join(targetDir, workflowPath), 'utf8')).toContain('Team Release')
  }
  finally {
    await rm(root, { recursive: true, force: true })
  }
})

it('does not claim ownership of caller-provided assets', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'repoctl-scaffold-custom-'))
  try {
    const customAssets = path.join(root, 'assets')
    await mkdir(path.join(customAssets, '.github/workflows'), { recursive: true })
    await writeFile(path.join(customAssets, '.github/workflows/release.yml'), '# repoctl-managed: release/v2\nname: Custom\n')
    const targetDir = path.join(root, 'project')
    await scaffoldWorkspace({ targetDir, assetsDir: customAssets })
    await expect(access(path.join(targetDir, '.repoctl/baselines/root'))).rejects.toMatchObject({ code: 'ENOENT' })
  }
  finally {
    await rm(root, { recursive: true, force: true })
  }
})
