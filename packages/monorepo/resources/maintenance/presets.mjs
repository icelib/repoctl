/** Embedded with the publisher: fixed workflow policy and committed JSON are the only authorities. */
export function validatePresetMaintenance({ report, expected, git, hash, fail, Buffer }) {
  const allowed = new Set()
  if (report.presets === undefined) {
    return allowed
  }
  const { versions, plan } = report.presets
  if (!Array.isArray(versions) || new Set(versions.map(change => change.packageName)).size !== versions.length
    || versions.some(change => !['changed', 'unchanged'].includes(change.status))) {
    fail('invalid preset version evidence')
  }
  const manifest = sha => JSON.parse(git(['show', `${sha}:package.json`]).toString())
  const fromManifest = manifest(expected.base)
  const toManifest = manifest(expected.head)
  const exact = value => typeof value === 'string' && /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Z.-]+)?(?:\+[0-9A-Z.-]+)?$/i.test(value)
  const version = (root, name) => {
    const entries = ['dependencies', 'devDependencies', 'optionalDependencies'].flatMap(key => Object.hasOwn(root[key] ?? {}, name) ? [root[key][name]] : [])
    return entries.length === 1 && exact(entries[0]) ? entries[0] : null
  }
  const changes = new Map()
  for (const change of versions) {
    if (!exact(change.from) || !exact(change.to) || version(fromManifest, change.packageName) !== change.from
      || version(toManifest, change.packageName) !== change.to || (change.from === change.to) !== (change.status === 'unchanged')) {
      fail('preset version differs from committed exact dependencies')
    }
    changes.set(change.packageName, change)
  }
  if (plan === null) {
    return allowed
  }
  if (!plan || plan.schemaVersion !== 1 || plan.kind !== 'organization-preset-assets'
    || !['ready', 'unchanged'].includes(plan.status) || !Array.isArray(plan.files) || !Array.isArray(plan.conflicts) || plan.conflicts.length
    || new Set(plan.files.map(file => file.path)).size !== plan.files.length) {
    fail('preset plan is missing, duplicated or conflicted')
  }
  const baselinePath = target => `.repoctl/baselines/presets/${hash(target)}.json`
  const baseline = (bytes, file, targetVersion) => {
    const record = JSON.parse(bytes.toString())
    const content = typeof record.upstream?.content === 'string' ? Buffer.from(record.upstream.content, 'base64') : null
    if (record.schemaVersion !== 1 || record.path !== file.path || record.source?.packageName !== file.source.packageName
      || record.source?.path !== file.source.path || !exact(record.source?.version)
      || (targetVersion && record.source.version !== targetVersion) || !content
      || content.toString('base64') !== record.upstream.content || hash(content) !== record.upstream.hash) {
      fail('preset baseline identity, version or upstream hash is invalid')
    }
    return record
  }
  const applied = plan.files.some(file => file.beforeHash !== file.afterHash)
  for (const file of plan.files) {
    const change = changes.get(file.source?.packageName)
    const policy = (expected.presetAssets ?? []).find(asset => asset.packageName === file.source?.packageName && asset.source === file.source?.path && asset.target === file.path)
    if (!policy || change?.status !== 'changed' || file.source.version !== change.to
      || !['modify', 'identical'].includes(file.status) || !file.beforeHash || !file.afterHash || typeof file.content !== 'string') {
      fail('preset asset is outside the fixed workflow policy or changed provider')
    }
    const filename = baselinePath(file.path)
    const next = file.baseline
    if (!next || next.path !== filename || !next.beforeHash || !next.afterHash || typeof next.content !== 'string') {
      fail('preset asset requires an existing baseline at its exact target digest')
    }
    let previous
    let original
    try {
      previous = git(['show', `${expected.head}:${filename}`])
      original = git(['show', `${expected.base}:${filename}`])
    }
    catch {
      fail('new preset ownership requires explicit adoption')
    }
    baseline(original, file)
    baseline(previous, file)
    if (hash(previous) !== next.beforeHash || hash(git(['show', `${expected.head}:${file.path}`])) !== file.beforeHash) {
      fail('preset source precondition differs from committed ownership')
    }
    const upstream = Buffer.from(next.content, 'base64')
    const content = Buffer.from(file.content, 'base64')
    if (upstream.toString('base64') !== next.content || hash(upstream) !== next.afterHash
      || content.toString('base64') !== file.content || hash(content) !== file.afterHash) {
      fail('preset plan bytes or baseline digest differ')
    }
    baseline(upstream, file, change.to)
    for (const operation of [file, next]) {
      const entry = report.files.find(entry => entry.path === operation.path)
      if (entry && (entry.beforeHash !== operation.beforeHash || entry.afterHash !== operation.afterHash || !entry.beforeMode || !entry.afterMode)) {
        fail('preset patch differs from its reviewed plan or removes ownership')
      }
      if (applied && operation.beforeHash !== operation.afterHash) {
        if (!entry) {
          fail('preset patch omits a changed asset or its ownership baseline')
        }
        allowed.add(operation.path)
      }
    }
  }
  return allowed
}
