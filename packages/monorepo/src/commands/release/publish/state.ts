import type { PublishedPackage } from '../types'
import { randomUUID } from 'node:crypto'
import { rename, rm, writeFile } from 'node:fs/promises'
import path from 'pathe'

export function packageKey(pkg: PublishedPackage) {
  return `${pkg.name}@${pkg.version}`
}

async function writeJsonAtomic(filename: string, value: unknown) {
  const temporary = `${filename}.${randomUUID()}.tmp`
  try {
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
    await rename(temporary, filename)
  }
  finally {
    await rm(temporary, { force: true })
  }
}

/** Evidence is monotonic for this invocation; old on-disk reports are never trusted. */
export class PublishState {
  private readonly accepted = new Map<string, PublishedPackage>()
  private readonly confirmed = new Set<string>()
  private readonly allowed: Set<string>

  constructor(readonly candidates: PublishedPackage[]) {
    this.allowed = new Set(candidates.map(packageKey))
  }

  accept(packages: PublishedPackage[]) {
    for (const pkg of packages) {
      if (this.allowed.has(packageKey(pkg))) {
        this.accepted.set(packageKey(pkg), pkg)
      }
    }
  }

  confirm(pkg: PublishedPackage) {
    this.accept([pkg])
    if (this.allowed.has(packageKey(pkg))) {
      this.confirmed.add(packageKey(pkg))
    }
  }

  get acceptedPackages() {
    return [...this.accepted.values()]
  }

  get pendingUploads() {
    return this.candidates.filter(pkg => !this.accepted.has(packageKey(pkg)))
  }

  unconfirmed(packages = this.acceptedPackages) {
    return packages.filter(pkg => !this.confirmed.has(packageKey(pkg)))
  }

  async save(cwd: string, status: 'publishing' | 'confirming' | 'complete' | 'failed') {
    const acceptedPackages = this.acceptedPackages
    await writeJsonAtomic(path.join(cwd, 'repoctl-publish-progress.json'), {
      schemaVersion: 1,
      status,
      candidates: this.candidates,
      acceptedPackages,
      confirmedPackages: acceptedPackages.filter(pkg => this.confirmed.has(packageKey(pkg))),
    })
    await writeJsonAtomic(path.join(cwd, 'pnpm-publish-summary.json'), { publishedPackages: acceptedPackages })
  }
}
