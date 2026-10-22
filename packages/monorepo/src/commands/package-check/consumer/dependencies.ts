import type { DependencyReference } from '../dependencies'
import type { PackageCheckResult, PackedPackage } from '../types'
import { satisfies, validRange } from 'semver'
import { dependencyReferences } from '../dependencies'

export interface ExpectedWorkspaceLocator {
  name: string
  locator: string
}

/** Package name -> dependency-field.alias -> exact publication locator. */
export type ExpectedWorkspaceLocators = ReadonlyMap<string, ReadonlyMap<string, ExpectedWorkspaceLocator>>

export function consumerDependency(pkg: PackedPackage, reference: DependencyReference, expected?: ExpectedWorkspaceLocators) {
  return expected?.get(String(pkg.manifest.name))?.get(`${reference.field}.${reference.alias}`)
}

export function checkDependencyRanges(pkg: PackedPackage, packages: PackedPackage[], results: PackageCheckResult[], expected?: ExpectedWorkspaceLocators) {
  for (const reference of dependencyReferences(pkg.manifest, pkg.result.directory)) {
    const { alias, range, field, protocol } = reference
    const locator = consumerDependency(pkg, reference, expected)
    const name = locator?.name ?? reference.name
    const file = `package.json:${field}.${alias}`
    const local = packages.find(candidate => candidate.manifest.name === name)
    if (protocol !== 'registry') {
      pkg.result.diagnostics.push({ source: 'repoctl', code: 'UNCONVERTED_LOCAL_DEPENDENCY', severity: 'error', file, message: `Packed dependency ${alias} still uses ${protocol}: instead of a publishable registry version.` })
    }
    if (!local && (locator || results.some(candidate => candidate.name === name))) {
      pkg.result.diagnostics.push({ source: 'repoctl', code: 'WORKSPACE_DEPENDENCY_UNAVAILABLE', severity: 'error', file, message: `Workspace dependency ${name} has no checked tarball (private, skipped, or failed packing).` })
    }
    const actual = pkg.manifest[field as keyof typeof pkg.manifest] as Record<string, string> | undefined
    const accepted = locator
      ? actual?.[alias] === locator.locator
      : validRange(range) && satisfies(String(local?.manifest.version), range)
    if (local && !accepted) {
      const message = locator
        ? `Packed dependency ${name}@${range} does not match expected workspace locator ${locator.locator}.`
        : `Packed dependency ${name}@${range} does not accept workspace tarball version ${local.manifest.version}.`
      pkg.result.diagnostics.push({ source: 'repoctl', code: 'WORKSPACE_DEPENDENCY_RANGE', severity: 'error', file, message })
    }
  }
}
