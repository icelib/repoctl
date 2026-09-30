import { afterEach, describe, expect, it, vi } from 'vitest'

const engine = vi.hoisted(() => ({ initialize: vi.fn(), render: vi.fn() }))
vi.mock('mermaid', () => ({ default: engine }))

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetAllMocks()
})

describe('Mermaid rendering queue', () => {
  it('serializes theme configuration with rendering and cleans up failed diagrams', async () => {
    const containers: { remove: ReturnType<typeof vi.fn> }[] = []
    vi.stubGlobal('document', {
      createElement: () => {
        const container = { style: {}, setAttribute: vi.fn(), remove: vi.fn() }
        containers.push(container)
        return container
      },
      body: { append: vi.fn() },
    })
    const { renderMermaid } = await import('../.vitepress/mermaid/render')
    const first = Promise.withResolvers<{ svg: string }>()
    const started = Promise.withResolvers<void>()
    engine.render.mockImplementationOnce(() => {
      started.resolve()
      return first.promise
    }).mockRejectedValueOnce(new Error('Invalid diagram')).mockResolvedValueOnce({ svg: '<svg />' })

    const one = renderMermaid('flowchart LR; A-->B', 'forest')
    const two = renderMermaid('invalid', 'dark')
    const failure = expect(two).rejects.toThrow('Invalid diagram')
    const three = renderMermaid('flowchart LR; B-->C', 'neutral')
    await started.promise
    expect(engine.initialize).toHaveBeenCalledTimes(1)
    expect(engine.initialize).toHaveBeenLastCalledWith(expect.objectContaining({ theme: 'forest' }))
    first.resolve({ svg: '<svg />' })
    await one
    await failure
    await expect(three).resolves.toEqual({ svg: '<svg />' })
    expect(engine.initialize.mock.calls.map(([config]) => config.theme)).toEqual(['forest', 'dark', 'neutral'])
    expect(new Set(engine.render.mock.calls.map(([id]) => id)).size).toBe(3)
    expect(containers).toHaveLength(3)
    for (const container of containers) {
      expect(container.remove).toHaveBeenCalledOnce()
    }
  })
})
