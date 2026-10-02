import type { TemplateDefinition } from '@icebreakers/monorepo-templates'
import type { CreateChoiceOption } from '../../types'
import { templateChoices } from '@icebreakers/monorepo-templates'

// Retain the historical literal API types; runtime values come from the shared registry.
interface BuiltinTemplatePaths {
  'tsdown': ['tsdown', 'packages/tsdown']
  'vue-lib': ['vue-lib', 'packages/vue-lib']
  'hono-server': ['server', 'apps/server']
  'react-vite': ['react-vite', 'apps/react-vite']
  'vue-hono': ['client', 'apps/client']
  'vitepress': ['vitepress', 'apps/website']
  'cli': ['cli', 'apps/cli']
  'nimbus': ['nimbus', 'apps/docs']
  'react-lib': ['react-lib', 'packages/react-lib']
}

const legacyOrder = new Map<string, number>(['tsdown', 'vue-lib', 'hono-server', 'react-vite', 'vue-hono', 'vitepress', 'cli', 'nimbus', 'react-lib'].map((key, index) => [key, index]))
const legacyChoices = [...templateChoices].sort((left, right) => (legacyOrder.get(left.key) ?? Infinity) - (legacyOrder.get(right.key) ?? Infinity))

export const templateMap = Object.fromEntries(legacyChoices.map(({ key, source, target }) => [key, { source, target }])) as {
  readonly [Key in keyof BuiltinTemplatePaths]: {
    readonly source: BuiltinTemplatePaths[Key][0]
    readonly target: BuiltinTemplatePaths[Key][1]
  }
}

export function normalizeTemplateDefinition(value: string | TemplateDefinition): TemplateDefinition {
  return typeof value === 'string' ? { source: value, target: value } : value
}

export function getTemplateMap(extra?: Record<string, string | TemplateDefinition>): Record<string, TemplateDefinition> {
  return Object.fromEntries([
    ...Object.entries(templateMap),
    ...Object.entries(extra ?? {}).map(([key, value]) => [key, normalizeTemplateDefinition(value)]),
  ])
}

export function getCreateChoices(choices?: CreateChoiceOption[]): CreateChoiceOption[] {
  return choices?.length
    ? choices
    : templateChoices.map(choice => ({
        name: choice.label,
        value: choice.key,
        ...(choice.description ? { description: choice.description } : {}),
      }))
}
