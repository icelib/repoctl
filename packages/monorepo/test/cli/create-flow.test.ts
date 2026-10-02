import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'pathe'
import { describe, expect, it } from 'vitest'
import { createNewProjectMock, errorMock, infoMock, inputMock, logMock, resolveCommandConfigMock, resolveCreateNewProjectPlanMock, selectMock, setTty, successMock } from './create-flow/fixtures'

describe('runCreateFlow', () => {
  it('uses intent flow for library creation by default', async () => {
    setTty(true)
    selectMock
      .mockResolvedValueOnce('library')
      .mockResolvedValueOnce('tsdown')

    const { runCreateFlow } = await import('@/cli/commands/package/create-flow')
    await runCreateFlow('/repo', '')

    expect(createNewProjectMock).toHaveBeenCalledWith({
      name: 'packages/demo',
      cwd: '/repo',
      type: 'tsdown',
    })
  })

  it('offers custom templates from the shared catalog and preserves choice metadata', async () => {
    setTty(true)
    resolveCommandConfigMock.mockResolvedValueOnce({
      templateMap: { internal: { source: 'service', target: 'apps/internal', category: 'service', description: 'Internal API' } },
      choices: [{ value: 'internal', name: 'Company service', description: 'Company API' }],
    })
    selectMock.mockResolvedValueOnce('internal')
    const { runCreateFlow } = await import('@/cli/commands/package/create-flow')
    await runCreateFlow('/repo', 'service')
    expect(selectMock).toHaveBeenCalledWith(expect.objectContaining({ choices: [{ value: 'internal', name: 'Company service', description: 'Company API' }] }))
    expect(createNewProjectMock).toHaveBeenCalledWith({ cwd: '/repo', name: 'apps/service', type: 'internal' })
  })

  it('maps web-app intent to apps directory', async () => {
    setTty(true)
    selectMock.mockResolvedValueOnce('web-app').mockResolvedValueOnce('vue-hono')

    const { runCreateFlow } = await import('@/cli/commands/package/create-flow')
    await runCreateFlow('/repo', 'portal')

    expect(createNewProjectMock).toHaveBeenCalledWith({
      name: 'apps/portal',
      cwd: '/repo',
      type: 'vue-hono',
    })
  })

  it('selects React from the web-app intent without changing the Vue default', async () => {
    setTty(true)
    selectMock.mockResolvedValueOnce('web-app').mockResolvedValueOnce('react-vite')
    const { runCreateFlow } = await import('@/cli/commands/package/create-flow')
    await runCreateFlow('/repo', 'portal')
    expect(createNewProjectMock).toHaveBeenCalledWith({ name: 'apps/portal', cwd: '/repo', type: 'react-vite' })
    expect(selectMock).toHaveBeenLastCalledWith(expect.objectContaining({ default: 'vue-hono' }))
  })

  it('keeps explicit nested paths unchanged in intent flow', async () => {
    setTty(true)
    selectMock.mockResolvedValueOnce('api-service')

    const { runCreateFlow } = await import('@/cli/commands/package/create-flow')
    await runCreateFlow('/repo', 'apps/custom-api')

    expect(createNewProjectMock).toHaveBeenCalledWith({
      name: 'apps/custom-api',
      cwd: '/repo',
      type: 'hono-server',
    })
  })

  it('falls back to template flow when default template is configured', async () => {
    setTty(true)
    resolveCommandConfigMock.mockResolvedValueOnce({
      defaultTemplate: 'cli',
      choices: [{ name: 'CLI', value: 'cli' }],
    })

    const { runCreateFlow } = await import('@/cli/commands/package/create-flow')
    await runCreateFlow('/repo', '')

    expect(createNewProjectMock).toHaveBeenCalledWith({
      name: 'apps/demo',
      cwd: '/repo',
      type: 'cli',
    })
  })

  it('uses the explicit CLI template override without prompting for intent', async () => {
    const { runCreateFlow } = await import('@/cli/commands/package/create-flow')
    await runCreateFlow('/repo', 'dashboard', { template: 'vue-hono' })

    expect(selectMock).not.toHaveBeenCalled()
    expect(createNewProjectMock).toHaveBeenCalledWith({
      name: 'apps/dashboard',
      cwd: '/repo',
      type: 'vue-hono',
    })
  })

  it('uses safe defaults without prompting in non-TTY mode', async () => {
    setTty(false)

    const { runCreateFlow } = await import('@/cli/commands/package/create-flow')
    await runCreateFlow('/repo', undefined)

    expect(selectMock).not.toHaveBeenCalled()
    expect(inputMock).not.toHaveBeenCalled()
    expect(createNewProjectMock).toHaveBeenCalledWith({
      name: 'packages/my-package',
      cwd: '/repo',
      type: 'tsdown',
    })
  })

  it('prints a create preview without writing files in dry-run mode', async () => {
    const { runCreateFlow } = await import('@/cli/commands/package/create-flow')
    const result = await runCreateFlow('/repo', 'demo', { template: 'tsdown', dryRun: true })

    expect(result).toEqual({ dryRun: true })
    expect(createNewProjectMock).not.toHaveBeenCalled()
    expect(resolveCreateNewProjectPlanMock).toHaveBeenCalledWith({
      name: 'packages/demo',
      cwd: '/repo',
      type: 'tsdown',
    })
    expect(logMock).toHaveBeenCalledWith('Create preview:')
    expect(infoMock).toHaveBeenCalledWith('Dry run only; no files were written.')
  })

  it('prints a create preview as json without writing files', async () => {
    const { runCreateFlow } = await import('@/cli/commands/package/create-flow')
    const result = await runCreateFlow('/repo', 'demo', { template: 'tsdown', dryRun: true, json: true })

    expect(result).toEqual({ dryRun: true })
    expect(createNewProjectMock).not.toHaveBeenCalled()
    expect(resolveCreateNewProjectPlanMock).toHaveBeenCalledWith({
      name: 'packages/demo',
      cwd: '/repo',
      type: 'tsdown',
    })
    expect(logMock).toHaveBeenCalledWith(expect.stringContaining('"template": "tsdown"'))
    expect(infoMock).not.toHaveBeenCalledWith('Dry run only; no files were written.')
  })

  it('writes a create preview as json when out is set', async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), 'repo-create-plan-'))

    try {
      const { runCreateFlow } = await import('@/cli/commands/package/create-flow')
      const result = await runCreateFlow(cwd, 'demo', { template: 'tsdown', dryRun: true, json: true, out: 'plans/create.json' })

      expect(result).toEqual({ dryRun: true })
      expect(createNewProjectMock).not.toHaveBeenCalled()
      expect(JSON.parse(await readFile(path.join(cwd, 'plans/create.json'), 'utf8'))).toEqual(expect.objectContaining({
        template: 'tsdown',
        targetName: 'packages/demo',
      }))
      expect(successMock).toHaveBeenCalledWith('Wrote plans/create.json')
      expect(logMock).not.toHaveBeenCalledWith(expect.stringContaining('"template": "tsdown"'))
      expect(infoMock).not.toHaveBeenCalledWith('Dry run only; no files were written.')
    }
    finally {
      await rm(cwd, { recursive: true, force: true })
    }
  })

  it('writes a create preview as text when out is set without json', async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), 'repo-create-plan-'))

    try {
      const { runCreateFlow } = await import('@/cli/commands/package/create-flow')
      const result = await runCreateFlow(cwd, 'demo', { template: 'tsdown', dryRun: true, out: 'plans/create.txt' })

      expect(result).toEqual({ dryRun: true })
      expect(await readFile(path.join(cwd, 'plans/create.txt'), 'utf8')).toContain('Create preview:')
      expect(successMock).toHaveBeenCalledWith('Wrote plans/create.txt')
      expect(infoMock).not.toHaveBeenCalledWith('Dry run only; no files were written.')
    }
    finally {
      await rm(cwd, { recursive: true, force: true })
    }
  })

  it('prints create errors without throwing a stack from the CLI flow', async () => {
    createNewProjectMock.mockRejectedValueOnce(new Error('未知模板：tsdwon。你是不是想用 tsdown？'))

    const previousExitCode = process.exitCode
    process.exitCode = undefined

    const { runCreateFlow } = await import('@/cli/commands/package/create-flow')
    const result = await runCreateFlow('/repo', 'demo', { template: 'tsdwon' })

    expect(result).toEqual({ dryRun: false, failed: true })
    expect(errorMock).toHaveBeenCalledWith('未知模板：tsdwon。你是不是想用 tsdown？')
    expect(process.exitCode).toBe(1)

    process.exitCode = previousExitCode
  })

  it('prints create errors as json when json mode is enabled', async () => {
    createNewProjectMock.mockRejectedValueOnce(new Error('未知模板：tsdwon。你是不是想用 tsdown？'))

    const previousExitCode = process.exitCode
    process.exitCode = undefined

    const { runCreateFlow } = await import('@/cli/commands/package/create-flow')
    const result = await runCreateFlow('/repo', 'demo', { template: 'tsdwon', json: true })

    expect(result).toEqual({ dryRun: false, failed: true })
    expect(logMock).toHaveBeenCalledWith(expect.stringContaining('"error": "未知模板：tsdwon。你是不是想用 tsdown？"'))
    expect(errorMock).not.toHaveBeenCalled()
    expect(process.exitCode).toBe(1)

    process.exitCode = previousExitCode
  })
})
