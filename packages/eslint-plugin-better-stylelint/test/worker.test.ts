const createRequireMock = vi.fn<() => { resolve: (specifier: string) => string }>()

vi.mock('node:module', () => {
  return {
    createRequire: createRequireMock,
  }
})

describe('worker resolution', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  it('prefers the project stylelint installation', async () => {
    const projectRequire = {
      resolve: vi.fn(() => '/project/node_modules/stylelint/lib/index.mjs'),
    }

    createRequireMock.mockReturnValue(projectRequire)

    const worker = await import('@/worker')

    expect(worker.__resolveStylelintEntry('/tmp/project')).toBe(
      '/project/node_modules/stylelint/lib/index.mjs',
    )
    expect(projectRequire.resolve).toHaveBeenCalledWith('stylelint')
  })

  it('falls back to the bundled stylelint installation', async () => {
    const projectRequire = {
      resolve: vi.fn(() => {
        throw new Error('missing project stylelint')
      }),
    }
    const localRequire = {
      resolve: vi.fn(() => '/plugin/node_modules/stylelint/lib/index.mjs'),
    }

    createRequireMock
      .mockReturnValueOnce(projectRequire)
      .mockReturnValueOnce(localRequire)

    const worker = await import('@/worker')

    expect(worker.__resolveStylelintEntry('/tmp/project')).toBe(
      '/plugin/node_modules/stylelint/lib/index.mjs',
    )
    expect(projectRequire.resolve).toHaveBeenCalledWith('stylelint')
    expect(localRequire.resolve).toHaveBeenCalledWith('stylelint')
  })
})
