import { tmpdir } from 'node:os'
import path from 'pathe'
import { describe, expect, it } from 'vitest'
import fs from '@/utils/fs'

async function createTempTemplatesDir() {
  return fs.mkdtemp(path.join(tmpdir(), 'monorepo-template-health-'))
}

describe('checkTemplates', () => {
  it('reports healthy packaged templates', async () => {
    const { checkTemplates } = await import('@/commands/templates')
    const report = await checkTemplates()

    expect(report.templateCount).toBeGreaterThan(0)
    expect(report.summary.fail).toBe(0)
    expect(report.checks.some(check => check.id === 'unique-source' && check.status === 'pass')).toBe(true)
    expect(report.checks.some(check => check.id === 'metadata' && check.status === 'pass')).toBe(true)
  })

  it('excludes generated declarations but keeps authored types in templates', async () => {
    const { shouldSkipTemplatePath } = await import('@icebreakers/monorepo-templates')
    const sourceDir = '/repo/templates/client'

    expect(shouldSkipTemplatePath(sourceDir, path.join(sourceDir, '.cloudflare/types/index.d.ts'))).toBe(true)
    expect(shouldSkipTemplatePath(sourceDir, path.join(sourceDir, '.cloudflare/build/worker.js'))).toBe(true)
    expect(shouldSkipTemplatePath(sourceDir, path.join(sourceDir, 'cloudflare.config.ts'))).toBe(false)
    expect(shouldSkipTemplatePath(sourceDir, path.join(sourceDir, 'worker-configuration.d.ts'))).toBe(true)
    expect(shouldSkipTemplatePath(sourceDir, path.join(sourceDir, 'src/env.d.ts'))).toBe(false)
    expect(shouldSkipTemplatePath(sourceDir, path.join(sourceDir, 'route-map.d.ts'))).toBe(true)
  })

  it('flags missing sources when checking another templates directory', async () => {
    const templatesDir = await createTempTemplatesDir()

    const { checkTemplates } = await import('@/commands/templates')
    const report = await checkTemplates({ templatesDir })

    expect(report.summary.fail).toBeGreaterThan(0)
    expect(report.checks.some(check => check.id === 'source-dir' && check.status === 'fail')).toBe(true)

    await fs.remove(templatesDir)
  })
})
