import type { MigrationDefinition } from '@/commands/upgrade/migrations/registry'
import { expect, it } from 'vitest'
import { selectMigrations } from '@/commands/upgrade/migrations/registry'

it('selects every crossed boundary once in deterministic version and ID order', () => {
  const registry: MigrationDefinition[] = [
    { id: 'later', version: '3.0.0', adoptUnknown: false, detect: async () => true, plan: async () => [] },
    { id: 'second-b', version: '2.0.0', adoptUnknown: false, detect: async () => true, plan: async () => [] },
    { id: 'first', version: '1.0.0', adoptUnknown: false, detect: async () => true, plan: async () => [] },
    { id: 'second-a', version: '2.0.0', adoptUnknown: false, detect: async () => true, plan: async () => [] },
  ]
  expect(selectMigrations(registry, '0.9.0', '2.0.0').map(item => item.id)).toEqual(['first', 'second-a', 'second-b'])
  expect(selectMigrations(registry, '1.0.0', '2.5.0').map(item => item.id)).toEqual(['second-a', 'second-b'])
  expect(selectMigrations(registry, '3.0.0', '3.0.0')).toEqual([])
})
