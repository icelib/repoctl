import type { MarkdownRenderer } from 'vitepress'

export function mermaidMarkdown(md: MarkdownRenderer) {
  const fence = md.renderer.rules.fence!
  md.renderer.rules.fence = (tokens, index, options, env, renderer) => {
    const token = tokens[index]!
    const language = token.info.trim()
    if (language === 'mermaid') {
      const graph = md.utils.escapeHtml(encodeURIComponent(token.content))
      return `<Mermaid graph="${graph}" />\n`
    }
    // Keep the old plugin's escape hatch for displaying Mermaid source code.
    if (language === 'mmd') {
      token.info = 'mermaid'
    }
    return fence(tokens, index, options, env, renderer)
  }
}
