import process from 'node:process'
import { afterEach, beforeEach, vi } from 'vitest'
import { loadedConfigFixture } from '../../helpers/config'

export const inputMock = vi.fn(async () => 'demo')
export const selectMock = vi.fn(async () => 'library')
export const createNewProjectMock = vi.fn(async () => {})
export const resolveCreateNewProjectPlanMock = vi.fn(async () => ({
  cwd: '/repo',
  requestedTemplate: 'tsdown',
  template: 'tsdown',
  usedFallback: false,
  sourceDir: '/repo/templates/tsdown',
  targetName: 'packages/demo',
  targetDir: '/repo/packages/demo',
  targetExists: false,
  renameJson: false,
  hasPackageJson: true,
  packageJsonFileName: 'package.json',
  packageName: 'demo',
  templateDefinition: { source: 'tsdown', target: 'packages/tsdown' },
}))
export const getCreateChoicesMock = vi.fn(() => [])
export const resolveCommandConfigMock = vi.fn(async () => ({}))
export const logMock = vi.fn()
export const infoMock = vi.fn()
export const errorMock = vi.fn()
export const successMock = vi.fn()

export function setTty(value: boolean) {
  Object.defineProperty(process.stdin, 'isTTY', {
    configurable: true,
    value,
  })
  Object.defineProperty(process.stdout, 'isTTY', {
    configurable: true,
    value,
  })
}

beforeEach(async () => {
  await vi.resetModules()
  inputMock.mockReset()
  selectMock.mockReset()
  createNewProjectMock.mockReset()
  resolveCreateNewProjectPlanMock.mockClear()
  getCreateChoicesMock.mockReset()
  resolveCommandConfigMock.mockReset()
  logMock.mockClear()
  infoMock.mockClear()
  errorMock.mockClear()
  successMock.mockClear()

  inputMock.mockResolvedValue('demo')
  getCreateChoicesMock.mockReturnValue([])
  resolveCommandConfigMock.mockResolvedValue({})

  vi.doMock('@icebreakers/monorepo-templates', async () => {
    const actual = await vi.importActual<typeof import('@icebreakers/monorepo-templates')>('@icebreakers/monorepo-templates')
    return {
      ...actual,
      input: inputMock,
      select: selectMock,
    }
  })

  vi.doMock('@/commands', async () => {
    const actual = await vi.importActual<typeof import('@/commands')>('@/commands')
    return {
      ...actual,
      createNewProject: createNewProjectMock,
      getCreateChoices: getCreateChoicesMock,
      resolveCreateNewProjectPlan: resolveCreateNewProjectPlanMock,
    }
  })

  vi.doMock('@/core/config', () => ({
    resolveCommandConfig: resolveCommandConfigMock,
    loadMonorepoConfigDetails: async () => loadedConfigFixture({ commands: { create: await resolveCommandConfigMock() } }),
  }))

  vi.doMock('@/core/logger', () => ({
    logger: {
      log: logMock,
      info: infoMock,
      error: errorMock,
      success: successMock,
    },
  }))
})

afterEach(() => {
  vi.clearAllMocks()
})
