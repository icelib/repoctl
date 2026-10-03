import YAML from 'yaml'

export type LockfileData = Record<string, unknown>
export const lockfileRecord = (value: unknown): LockfileData | undefined => value && typeof value === 'object' && !Array.isArray(value) ? value as LockfileData : undefined

/** pnpm 12 prepends a separate package-manager/config dependency document. */
export function parseWorkspaceLockfile(source: string): LockfileData | undefined {
  try {
    const documents = YAML.parseAllDocuments(source)
    if (documents.some(document => document.errors.length)) {
      return undefined
    }
    const candidates = documents.map(document => lockfileRecord(document.toJSON())).filter((document) => {
      const root = lockfileRecord(lockfileRecord(document?.['importers'])?.['.'])
      return root && !('packageManagerDependencies' in root || 'configDependencies' in root)
    })
    return candidates.length === 1 && String(candidates[0]?.['lockfileVersion']) === '9.0' ? candidates[0] : undefined
  }
  catch {
    return undefined
  }
}
