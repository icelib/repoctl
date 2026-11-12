import type { SnapshotPackage } from './types'

export function snapshotInstallation(packages: Pick<SnapshotPackage, 'name' | 'version'>[], registry: string) {
  const args = ['add', ...packages.map(pkg => `${pkg.name}@${pkg.version}`), '--registry', registry]
  const quote = (value: string) => /^[\w@./:-]+$/.test(value) ? value : `'${value.replaceAll('\'', '\'\\\'\'')}'`
  return { install: { executable: 'pnpm' as const, args }, installCommand: `pnpm ${args.map(quote).join(' ')}` }
}
