import type { BetterStylelintRuleOptions } from './types'
import { runStylelintSync } from './core'

interface BetterStylelintDiagnostic {
  ruleId: string
  message: string
  line: number
  column: number
  endLine?: number
  endColumn?: number
}

interface RuleContext {
  filename: string
  options: BetterStylelintRuleOptions[]
  report: (descriptor: {
    loc: {
      start: { line: number, column: number }
      end?: { line: number, column: number }
    }
    message: string
  }) => void
  sourceCode: {
    text: string
  }
}

interface VueStyleBlock {
  attributes: Record<string, string | true>
  code: string
  content: string
  index: number
  label?: string
  startLine: number
  startColumn: number
  virtualFilename: string
}

const VUE_STYLE_BLOCK_PATTERN = /<style\b[^>]*>[\s\S]*?<\/style>/giu
const VUE_STYLE_OPENING_TAG_PATTERN = /^<style\b([^>]*)>/iu
const VUE_STYLE_CLOSING_TAG = '</style>'
const HTML_ATTRIBUTE_PATTERN = /([:@\w-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/gu

function getColumn(value: number | undefined) {
  return Math.max(0, (value ?? 1) - 1)
}

function getLineColumnAtOffset(source: string, offset: number) {
  let line = 1
  let column = 1

  for (let index = 0; index < offset; index += 1) {
    if (source[index] === '\n') {
      line += 1
      column = 1
      continue
    }

    column += 1
  }

  return { line, column }
}

function parseStyleAttributes(code: string): Record<string, string | true> {
  const openingTagMatch = code.match(VUE_STYLE_OPENING_TAG_PATTERN)
  const rawAttributes = openingTagMatch?.[1]

  if (!rawAttributes) {
    return {}
  }

  const attributes: Record<string, string | true> = {}

  for (const match of rawAttributes.matchAll(HTML_ATTRIBUTE_PATTERN)) {
    const name = match[1]

    if (!name) {
      continue
    }

    const value = match[2] ?? match[3] ?? match[4]
    attributes[name] = value === undefined ? true : value
  }

  return attributes
}

function createVueStyleBlockLabel(
  index: number,
  attributes: Record<string, string | true>,
  blockCount: number,
): string | undefined {
  const segments = blockCount > 1 ? [`style#${index + 1}`] : ['style']

  if (attributes['scoped']) {
    segments.push('scoped')
  }

  if (attributes['module']) {
    const moduleValue = attributes['module']
    segments.push(moduleValue === true ? 'module' : `module=${moduleValue}`)
  }

  if (typeof attributes['lang'] === 'string') {
    segments.push(`lang=${attributes['lang']}`)
  }

  return blockCount > 1 || segments.length > 1 ? segments.join(' ') : undefined
}

function normalizeStyleLang(attributes: Record<string, string | true>): string {
  const lang = attributes['lang']

  if (typeof lang !== 'string' || !lang.trim()) {
    return 'css'
  }

  return lang.trim().toLowerCase()
}

function createVueStyleVirtualFilename(filename: string, index: number, attributes: Record<string, string | true>) {
  const lang = normalizeStyleLang(attributes)
  return `${filename}__style_${index}.${lang}`
}

function extractVueStyleBlocks(source: string, filename = 'Component.vue'): VueStyleBlock[] {
  const matches = [...source.matchAll(VUE_STYLE_BLOCK_PATTERN)]
  const blocks: VueStyleBlock[] = []

  for (const [matchIndex, match] of matches.entries()) {
    const code = match[0]
    const matchOffset = match.index

    if (code === undefined || matchOffset === undefined) {
      continue
    }

    const attributes = parseStyleAttributes(code)
    const label = createVueStyleBlockLabel(matchIndex, attributes, matches.length)
    const openingTagMatch = code.match(VUE_STYLE_OPENING_TAG_PATTERN)
    const openingTag = openingTagMatch?.[0] ?? '<style>'
    const contentStartOffset = matchOffset + openingTag.length
    const contentEndOffset = matchOffset + code.length - VUE_STYLE_CLOSING_TAG.length
    const content = source.slice(contentStartOffset, contentEndOffset)
    const location = getLineColumnAtOffset(source, contentStartOffset)
    blocks.push({
      attributes,
      code,
      content,
      index: matchIndex,
      ...(label !== undefined ? { label } : {}),
      startLine: location.line,
      startColumn: location.column,
      virtualFilename: createVueStyleVirtualFilename(
        filename,
        matchIndex,
        attributes,
      ),
    })
  }

  return blocks
}

function mapDiagnosticToVueFile(
  diagnostic: BetterStylelintDiagnostic,
  block: VueStyleBlock,
): BetterStylelintDiagnostic {
  const mappedStartLine = block.startLine + diagnostic.line - 1
  const mappedEndLine = diagnostic.endLine !== undefined
    ? block.startLine + diagnostic.endLine - 1
    : undefined

  return {
    ...diagnostic,
    line: mappedStartLine,
    column: diagnostic.line === 1
      ? block.startColumn + diagnostic.column - 1
      : diagnostic.column,
    ...(mappedEndLine !== undefined ? { endLine: mappedEndLine } : {}),
    ...(diagnostic.endColumn !== undefined
      ? {
          endColumn: diagnostic.endLine === undefined || diagnostic.endLine === 1
            ? block.startColumn + diagnostic.endColumn - 1
            : diagnostic.endColumn,
        }
      : {}),
  }
}

function formatDiagnosticMessage(diagnostic: BetterStylelintDiagnostic, label?: string) {
  const ruleSuffix = diagnostic.ruleId ? ` (${diagnostic.ruleId})` : ''
  const message = !ruleSuffix || diagnostic.message.endsWith(ruleSuffix)
    ? diagnostic.message
    : `${diagnostic.message}${ruleSuffix}`

  return label ? `[${label}] ${message}` : message
}

export const lintRule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Run Stylelint and surface its diagnostics through ESLint',
    },
    schema: [
      {
        type: 'object',
        additionalProperties: false,
        properties: {
          cwd: {
            type: 'string',
          },
          config: {
            type: 'object',
          },
          configOptions: {
            type: 'object',
          },
          configLoader: {
            type: 'string',
          },
        },
      },
    ],
  },
  create(context: RuleContext) {
    return {
      Program() {
        if (!context.filename.endsWith('.vue')) {
          return
        }

        const options = context.options[0]
        const styleBlocks = extractVueStyleBlocks(context.sourceCode.text, context.filename)

        for (const styleBlock of styleBlocks) {
          const diagnostics = runStylelintSync(
            styleBlock.content,
            styleBlock.virtualFilename,
            options,
          )

          for (const diagnostic of diagnostics) {
            const mappedDiagnostic = mapDiagnosticToVueFile(diagnostic, styleBlock)

            context.report({
              loc: {
                start: {
                  line: mappedDiagnostic.line,
                  column: getColumn(mappedDiagnostic.column),
                },
                ...(mappedDiagnostic.endLine !== undefined || mappedDiagnostic.endColumn !== undefined
                  ? {
                      end: {
                        line: mappedDiagnostic.endLine ?? mappedDiagnostic.line,
                        column: getColumn(mappedDiagnostic.endColumn ?? mappedDiagnostic.column),
                      },
                    }
                  : {}),
              },
              message: formatDiagnosticMessage(mappedDiagnostic, styleBlock.label),
            })
          }
        }
      },
    }
  },
}

export {
  createVueStyleVirtualFilename as __createVueStyleVirtualFilename,
  extractVueStyleBlocks as __extractVueStyleBlocks,
  mapDiagnosticToVueFile as __mapDiagnosticToVueFile,
  normalizeStyleLang as __normalizeStyleLang,
  parseStyleAttributes as __parseStyleAttributes,
}
