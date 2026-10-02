import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { assetsDir, ensureTemplateAssetsPrepared } from '@icebreakers/monorepo-templates'
import { fdir as Fdir } from 'fdir'
import path from 'pathe'
import { createNewProject, upgradeMonorepo } from '@/commands'
import fs from '@/utils/fs'

async function scanFiles(root: string) {
  const api = new Fdir().withRelativePaths()
  const excludes = new Set(['.DS_Store'])

  const files = await api.crawl(root).withPromise()
  return files
    .filter((file) => {
      const filename = file.split('/').pop() ?? ''
      if (excludes.has(filename)) {
        return false
      }
      if (file.startsWith('.changeset/') && file.endsWith('.md')) {
        return false
      }
      return true
    })
    .sort((a, b) => a.localeCompare(b))
}

let testRoot = ''

function resolveTestPath(relativePath = '') {
  return path.resolve(testRoot, relativePath)
}

describe('createNewProject', () => {
  beforeAll(async () => {
    await ensureTemplateAssetsPrepared()
    testRoot = await mkdtemp(path.join(tmpdir(), 'monorepo-create-project-'))
  })

  afterAll(async () => {
    if (testRoot) {
      await fs.remove(testRoot)
    }
  })

  it('assets', async () => {
    const files = await scanFiles(assetsDir)
    expect(files).toMatchSnapshot()
  })

  it('upgradeMonorepo', async () => {
    await upgradeMonorepo({
      outDir: resolveTestPath('demo/upgrade'),
    })
    const files = await scanFiles(resolveTestPath('demo/upgrade'))
    expect(files).toMatchSnapshot()
  })

  it('createNewProject demo vue-ui case', async () => {
    await createNewProject({
      cwd: testRoot,
      name: 'demo/case-vue-ui',
      renameJson: true,
      type: 'vue-lib',
    })
    const files = await scanFiles(resolveTestPath('demo/case-vue-ui'))
    expect(files).toMatchSnapshot()
  })

  it('createNewProject demo default case', async () => {
    await createNewProject({
      cwd: testRoot,
      name: 'demo/case-default',
      renameJson: true,
    })
    const files = await scanFiles(resolveTestPath('demo/case-default'))
    expect(files).toMatchSnapshot()
  })

  it('createNewProject demo cli case', async () => {
    await createNewProject({
      cwd: testRoot,
      name: 'demo/cli',
      renameJson: true,
      type: 'cli',
    })
    const files = await scanFiles(resolveTestPath('demo/cli'))
    expect(files).toMatchSnapshot()
  })

  it('createNewProject demo client case', async () => {
    await createNewProject({
      cwd: testRoot,
      name: 'demo/client',
      renameJson: true,
      type: 'vue-hono',
    })
    const files = await scanFiles(resolveTestPath('demo/client'))
    expect(files).toMatchSnapshot()
  })

  it('createNewProject keeps scoped package names', async () => {
    const cwd = testRoot
    const scopedName = '@demo/scoped-case'
    const targetDir = path.resolve(cwd, scopedName)
    try {
      await createNewProject({
        cwd,
        name: scopedName,
        renameJson: true,
        type: 'tsdown',
      })
      const pkgJsonPath = path.join(targetDir, 'package.mock.json')
      const pkgJson = await fs.readJson(pkgJsonPath)
      expect(pkgJson.name).toBe(scopedName)
    }
    finally {
      await fs.remove(path.resolve(cwd, '@demo'))
    }
  })

  it('createNewProject demo server case', async () => {
    await createNewProject({
      cwd: testRoot,
      name: 'demo/server',
      renameJson: true,
      type: 'hono-server',
    })
    const files = await scanFiles(resolveTestPath('demo/server'))
    expect(files).toMatchSnapshot()
  })

  it('createNewProject demo website case', async () => {
    await createNewProject({
      cwd: testRoot,
      name: 'demo/website',
      renameJson: true,
      type: 'vitepress',
    })
    const files = await scanFiles(resolveTestPath('demo/website'))
    expect(files).toMatchSnapshot()
  })
})
