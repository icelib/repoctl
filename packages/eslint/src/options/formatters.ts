import type { UserDefinedOptions } from '../types'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import process from 'node:process'
import { defu } from 'defu'
import { isObject, isPackageAvailable } from '../utils'

type FormatterOptions = Exclude<UserDefinedOptions['formatters'], boolean | undefined>
type FormatterPrettierOptions = NonNullable<FormatterOptions['prettierOptions']>
type FormatterOxfmtOptions = NonNullable<FormatterOptions['oxfmtOptions']>
type EditorConfigEndOfLine = Extract<
  FormatterPrettierOptions['endOfLine'],
  'lf' | 'crlf' | 'cr'
>

const require = createRequire(import.meta.url)
const ANTFU_PACKAGE_DIR = path.dirname(
  require.resolve('@antfu/eslint-config/package.json'),
)
const GENERAL_EDITORCONFIG_SECTIONS = new Set([
  '*',
  '**',
  '**/*',
  '*.*',
  '**.*',
  '**/*.*',
])
const NEWLINE_PATTERN = /\r?\n/u

function getDefaultFormatterOptions(cwd = process.cwd()): FormatterOptions {
  const searchPaths = [cwd, ANTFU_PACKAGE_DIR]
  const hasXmlPlugin = isPackageAvailable('@prettier/plugin-xml', searchPaths)
  const hasSlidev = isPackageAvailable('@slidev/cli', searchPaths)

  return {
    astro: isPackageAvailable('prettier-plugin-astro', searchPaths),
    css: true,
    graphql: true,
    html: true,
    markdown: true,
    slidev: hasSlidev,
    svg: hasXmlPlugin,
    xml: hasXmlPlugin,
  }
}

function normalizeEditorConfigEndOfLine(value: string): EditorConfigEndOfLine | undefined {
  switch (value.trim().toLowerCase()) {
    case 'cr':
    case 'crlf':
    case 'lf':
      return value.trim().toLowerCase() as EditorConfigEndOfLine
    default:
      return undefined
  }
}

function isGeneralEditorConfigSection(section: string): boolean {
  return GENERAL_EDITORCONFIG_SECTIONS.has(section.trim())
}

function parseEditorConfig(filePath: string): {
  endOfLine?: EditorConfigEndOfLine
  isRoot: boolean
} {
  const lines = fs.readFileSync(filePath, 'utf8').split(NEWLINE_PATTERN)
  let currentSection: string | undefined
  let endOfLine: EditorConfigEndOfLine | undefined
  let isRoot = false

  for (const rawLine of lines) {
    const line = rawLine.trim()

    if (!line || line.startsWith('#') || line.startsWith(';')) {
      continue
    }

    if (line.startsWith('[') && line.endsWith(']')) {
      currentSection = line.slice(1, -1).trim()
      continue
    }

    const separatorIndex = line.indexOf('=')
    if (separatorIndex === -1) {
      continue
    }

    const key = line.slice(0, separatorIndex).trim().toLowerCase()
    const value = line.slice(separatorIndex + 1).trim()

    if (!currentSection && key === 'root') {
      isRoot = value.toLowerCase() === 'true'
      continue
    }

    if (key !== 'end_of_line') {
      continue
    }

    const normalized = normalizeEditorConfigEndOfLine(value)
    if (!normalized) {
      continue
    }

    if (!currentSection || isGeneralEditorConfigSection(currentSection)) {
      endOfLine = normalized
    }
  }

  return endOfLine
    ? {
        endOfLine,
        isRoot,
      }
    : {
        isRoot,
      }
}

function inferPrettierEndOfLineFromEditorConfig(cwd = process.cwd()): EditorConfigEndOfLine | undefined {
  const configs: string[] = []
  let currentDir = path.resolve(cwd)

  while (true) {
    const editorConfigPath = path.join(currentDir, '.editorconfig')

    if (fs.existsSync(editorConfigPath)) {
      configs.push(editorConfigPath)

      if (parseEditorConfig(editorConfigPath).isRoot) {
        break
      }
    }

    const parentDir = path.dirname(currentDir)
    if (parentDir === currentDir) {
      break
    }
    currentDir = parentDir
  }

  let endOfLine: EditorConfigEndOfLine | undefined

  for (const filePath of configs.reverse()) {
    const parsed = parseEditorConfig(filePath)
    if (parsed.endOfLine) {
      endOfLine = parsed.endOfLine
    }
  }

  return endOfLine
}

export function resolveFormattersOption(
  input: UserDefinedOptions['formatters'],
  cwd = process.cwd(),
): Exclude<UserDefinedOptions['formatters'], undefined> {
  if (input === false) {
    return false
  }

  const defaults = getDefaultFormatterOptions(cwd)
  const inferredEndOfLine = inferPrettierEndOfLineFromEditorConfig(cwd)
  const defaultsWithFormattingEngines = inferredEndOfLine
    ? defu<FormatterOptions, [FormatterOptions]>(
        {
          oxfmtOptions: {
            endOfLine: inferredEndOfLine,
          } satisfies FormatterOxfmtOptions,
          prettierOptions: {
            endOfLine: inferredEndOfLine,
          },
        },
        defaults,
      )
    : defaults

  if (input === undefined) {
    return defaultsWithFormattingEngines
  }

  if (input === true) {
    return defaultsWithFormattingEngines
  }

  if (isObject(input)) {
    return defu(input, defaultsWithFormattingEngines)
  }

  return defaultsWithFormattingEngines
}

export { inferPrettierEndOfLineFromEditorConfig as __inferPrettierEndOfLineFromEditorConfig }
export { parseEditorConfig as __parseEditorConfig }
