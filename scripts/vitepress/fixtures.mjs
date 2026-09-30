import { writeFileSync } from 'node:fs'
import path from 'node:path'

export function writeDiagramFixtures(website) {
  const diagrams = [
    '---',
    'mermaidTheme: forest',
    '---',
    '',
    '# Diagram acceptance',
    '',
    '[Leave diagrams](/start/)',
    '',
    '```mermaid',
    'flowchart LR',
    '  A["引号 & <tag> {{ value }}"] --> B["it\'s fine"]',
    '```',
    '',
    '```mermaid',
    'sequenceDiagram',
    '  Alice->>Bob: Hello',
    '```',
    '',
    '```mermaid',
    'invalid diagram syntax',
    '```',
    '',
    '```mermaid',
    'flowchart LR',
    '  C --> D',
    '```',
    '',
    '```mmd',
    'flowchart LR',
    '  Code --> Only',
    '```',
    '',
  ].join('\n')
  for (const locale of ['', 'zh']) {
    writeFileSync(path.join(website, locale, 'diagram-acceptance.md'), diagrams)
  }
}
