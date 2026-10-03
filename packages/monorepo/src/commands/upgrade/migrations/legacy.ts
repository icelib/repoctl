import type { MigrationDefinition } from './registry'
import { planVersioningMigration } from '../plan/migration'
import { migrationGroup } from './record'

export const legacyVersioningMigration: MigrationDefinition = {
  id: 'changesets-to-pnpm-versioning',
  // monorepo-templates/CHANGELOG.md: 1.1.0 introduced pnpm native versioning.
  version: '1.1.0',
  adoptUnknown: true,
  maintenance: {
    paths: ['.changeset/config.json', '.changeset/pre.json', 'pnpm-workspace.yaml', 'package.json', '.github/workflows/release.yml'],
    legacyPaths: ['.changeset/config.json', '.changeset/pre.json'],
  },
  detect: async ({ read }) => await read('target', '.changeset/pre.json') !== null || await read('target', '.changeset/config.json') !== null,
  check: async ({ read }) => {
    const files = ['.changeset/pre.json', '.changeset/config.json']
    for (const filename of files) {
      const content = await read('target', filename)
      if (content === null) {
        continue
      }
      try {
        const value = JSON.parse(content.toString()) as Record<string, unknown>
        if (!value || typeof value !== 'object' || Array.isArray(value)
          || (filename.endsWith('/pre.json') && (value['mode'] !== 'pre' || typeof value['tag'] !== 'string' || !value['tag'].trim()))) {
          throw new Error('Unrecognized Changesets metadata')
        }
      }
      catch {
        return { id: 'unrecognized-legacy-format', path: filename, retain: files, reason: 'prerelease-state-retained', detail: 'Unrecognized Changesets metadata requires manual review.' }
      }
    }
    return null
  },
  plan: async (context) => {
    await planVersioningMigration(context)
    return context.plan.files.filter(file => file.group === migrationGroup || file.reason === 'prerelease-state-retained').map(file => file.path)
  },
}
