/** Nested template assets are not rewritten by npm pack's workspace conversion. */
export function sanitizeTemplateManifest(content: string) {
  const manifest = JSON.parse(content) as Record<string, unknown>
  for (const field of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']) {
    const dependencies = manifest[field] as Record<string, string> | undefined
    for (const [name, version] of Object.entries(dependencies ?? {})) {
      if (name === 'repoctl' && version === 'workspace:*') {
        dependencies![name] = 'latest'
      }
      else if (/^(?:workspace|file|link|catalog):/.test(version)) {
        throw new Error(`Template ${field}.${name} contains an unsupported source-local dependency`)
      }
    }
  }
  return `${JSON.stringify(manifest, null, 2)}\n`
}
