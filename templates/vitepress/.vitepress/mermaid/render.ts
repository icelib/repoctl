import type { MermaidConfig, RenderResult } from 'mermaid'

let pending: Promise<unknown> = Promise.resolve()
let sequence = 0

export type MermaidTheme = NonNullable<MermaidConfig['theme']>
const themes: readonly MermaidTheme[] = ['base', 'dark', 'default', 'forest', 'neutral', 'neo', 'neo-dark', 'redux', 'redux-dark', 'redux-color', 'redux-dark-color', 'null']

export function resolveMermaidTheme(dark: boolean, theme: unknown): MermaidTheme {
  if (dark) {
    return 'dark'
  }
  return typeof theme === 'string' && themes.includes(theme as MermaidTheme)
    ? theme as MermaidTheme
    : 'default'
}

export function renderMermaid(source: string, theme: MermaidTheme): Promise<RenderResult> {
  // initialize() changes global state, so it must share the render queue.
  const result = pending.then(async () => {
    const { default: mermaid } = await import('mermaid')
    const container = document.createElement('div')
    container.setAttribute('aria-hidden', 'true')
    container.style.cssText = 'position:absolute;left:-10000px;top:0;'
    document.body.append(container)
    try {
      mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', suppressErrorRendering: true, theme })
      return await mermaid.render(`repoctl-mermaid-${++sequence}`, source, container)
    }
    finally {
      container.remove()
    }
  })
  // A malformed diagram must not block later diagrams.
  pending = result.catch(() => {})
  return result
}
