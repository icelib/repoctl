import type { TemplateParameterPrompt, TemplateParameterValues } from '@icebreakers/monorepo-templates'
import { readFile } from 'node:fs/promises'
import { input, password, select } from '@icebreakers/monorepo-templates'
import path from 'pathe'

export async function readParameterData(cwd: string, filename?: string): Promise<TemplateParameterValues | undefined> {
  if (!filename) {
    return undefined
  }
  const contents = await readFile(path.resolve(cwd, filename))
  if (contents.length > 1024 * 1024) {
    throw new Error('Template parameter data exceeds 1 MiB.')
  }
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(contents)) as TemplateParameterValues
  }
  catch {
    throw new Error('Template parameter data must contain valid UTF-8 JSON.')
  }
}

export const promptParameter: TemplateParameterPrompt = async (name, definition) => {
  const message = definition.description ?? name
  if (definition.type === 'boolean') {
    return select({ message, choices: [{ name: 'true', value: true }, { name: 'false', value: false }], ...(definition.default !== undefined ? { default: definition.default } : {}) })
  }
  if (definition.type === 'enum') {
    return select({ message, choices: definition.options.map(value => ({ name: value, value })), ...(definition.default !== undefined ? { default: definition.default } : {}) })
  }
  const value = definition.sensitive
    ? await password({ message, mask: '*' })
    : await input({ message, ...(definition.default !== undefined ? { default: definition.default } : {}) })
  return value === '' && !definition.required ? undefined : value
}
