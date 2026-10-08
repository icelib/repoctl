import fs from 'node:fs/promises'
import path from 'node:path'

async function declarationFiles(root: string): Promise<string[]> {
  const entries = await fs.readdir(root, { withFileTypes: true })
  const files: string[] = []
  for (const entry of entries) {
    const filename = path.join(root, entry.name)
    if (entry.isDirectory()) {
      files.push(...await declarationFiles(filename))
    }
    else if (/\.d\.(?:ts|mts|cts)$/.test(entry.name)) {
      files.push(filename)
    }
  }
  return files
}

describe('dts', () => {
  it('does not leak source path aliases', async () => {
    const distPath = path.resolve(__dirname, '../dist')
    const files = await declarationFiles(distPath)
    expect(files.length).toBeGreaterThan(0)
    for (const file of files) {
      const content = await fs.readFile(file, 'utf8')
      expect(content).not.toMatch(/from\s+["']@\//g)
    }
  })
})
