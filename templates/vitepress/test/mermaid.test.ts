import { createMarkdownRenderer } from 'vitepress'
import { describe, expect, it } from 'vitest'
import { mermaidMarkdown } from '../.vitepress/mermaid/markdown'
import { resolveMermaidTheme } from '../.vitepress/mermaid/render'

describe('Mermaid Markdown integration', () => {
  it('round-trips diagram text without injecting attributes or Vue expressions', async () => {
    const md = await createMarkdownRenderer(process.cwd(), { config: mermaidMarkdown })
    const source = 'flowchart LR\n A["引号 & <tag> {{ value }}"] --> B["it\'s fine"]\n'
    const html = await md.renderAsync(`\`\`\`mermaid\n${source}\`\`\``)
    const graph = html.match(/graph="([^"]+)"/)![1]!
    expect(decodeURIComponent(graph)).toBe(source)
    expect(html).not.toContain('<tag>')
    expect(html).not.toContain('{{ value }}')
    expect(html).toContain('<Mermaid ')
  })

  it('keeps normal fences and the mmd source-code escape hatch highlighted', async () => {
    const md = await createMarkdownRenderer(process.cwd(), { config: mermaidMarkdown })
    const html = await md.renderAsync('```ts\nconst answer = 42\n```\n\n```mmd\nflowchart LR\n A --> B\n```')
    expect(html).toContain('language-ts')
    expect(html).toContain('language-mermaid')
    expect(html).not.toContain('<Mermaid ')
    expect(html).toContain('shiki')
  })

  it('renders multiple independent component instances', async () => {
    const md = await createMarkdownRenderer(process.cwd(), { config: mermaidMarkdown })
    const html = await md.renderAsync('```mermaid\nflowchart LR\n A --> B\n```\n\n```mermaid\nsequenceDiagram\n A->>B: Hello\n```')
    expect(html.match(/<Mermaid /g)).toHaveLength(2)
  })

  it('validates page themes and lets dark mode take precedence', () => {
    expect(resolveMermaidTheme(false, 'forest')).toBe('forest')
    expect(resolveMermaidTheme(true, 'forest')).toBe('dark')
    expect(resolveMermaidTheme(false, { theme: 'forest' })).toBe('default')
    expect(resolveMermaidTheme(false, undefined)).toBe('default')
  })
})
