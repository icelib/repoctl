/** Shared by preparation and the embedded publisher; policy comes from the built-in registry. */
export function validateMaintenanceMigration({ plan, policy, read, templateVersion, validateLanes, hash, equal, Buffer, fail }) {
  const migration = plan?.migrations
  const committed = policy ? read(policy.ledgerPath) : null
  if (!migration?.ledger) {
    if (committed !== null) {
      let history
      try {
        history = JSON.parse(committed.toString())
      }
      catch {
        fail('invalid committed migration history')
      }
      if (!history || history.schemaVersion !== 1 || history.attempt !== null || !history.entries
        || typeof history.entries !== 'object' || Array.isArray(history.entries)
        || Object.values(history.entries).some(entry => !entry || entry.status !== 'completed')) {
        fail('interrupted migrations require a reviewed manual upgrade')
      }
    }
    if (migration?.steps?.some(step => ['pending', 'failed'].includes(step.status))) {
      fail('active migration has no reviewed ledger')
    }
    return null
  }
  const reject = message => fail(`invalid migration ledger: ${message}`)
  if (!policy || migration.ledger.path !== policy.ledgerPath || !Array.isArray(plan.files)
    || !Array.isArray(plan.inputs) || !Array.isArray(migration.steps) || !Array.isArray(migration.recovery)) {
    reject('missing fixed policy or plan')
  }
  const versionParts = (value) => {
    const match = typeof value === 'string' && /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([\dA-Z-]+(?:\.[\dA-Z-]+)*))?(?:\+[\dA-Z-]+(?:\.[\dA-Z-]+)*)?$/i.exec(value)
    if (!match || match.slice(1, 4).some(part => !Number.isSafeInteger(Number(part)))) {
      return null
    }
    const prerelease = match[4]?.split('.') ?? []
    return prerelease.some(part => /^\d+$/.test(part) && part.length > 1 && part.startsWith('0')) ? null : { core: match.slice(1, 4).map(Number), prerelease }
  }
  const version = value => versionParts(value) !== null
  const compare = (left, right) => {
    const a = versionParts(left)
    const b = versionParts(right)
    for (let index = 0; index < 3; index++) {
      if (a.core[index] !== b.core[index]) {
        return Math.sign(a.core[index] - b.core[index])
      }
    }
    if (!a.prerelease.length || !b.prerelease.length) {
      return Number(!a.prerelease.length) - Number(!b.prerelease.length)
    }
    for (let index = 0; index < Math.max(a.prerelease.length, b.prerelease.length); index++) {
      const x = a.prerelease[index]
      const y = b.prerelease[index]
      if (x === y) {
        continue
      }
      if (x === undefined || y === undefined) {
        return x === undefined ? -1 : 1
      }
      const numericX = /^\d+$/.test(x)
      const numericY = /^\d+$/.test(y)
      if (numericX && numericY) {
        return BigInt(x) < BigInt(y) ? -1 : 1
      }
      return numericX !== numericY ? (numericX ? -1 : 1) : x < y ? -1 : 1
    }
    return 0
  }
  const decode = (value) => {
    if (typeof value !== 'string') {
      reject('missing reviewed bytes')
    }
    const bytes = Buffer.from(value, 'base64')
    if (bytes.toString('base64') !== value) {
      reject('noncanonical reviewed bytes')
    }
    return bytes
  }
  const parse = (bytes) => {
    try {
      return JSON.parse(bytes.toString())
    }
    catch {
      reject('malformed JSON')
    }
  }
  const before = committed
  const previous = before === null ? { schemaVersion: 1, evaluatedVersion: null, entries: {}, attempt: null } : parse(before)
  if (!previous || previous.schemaVersion !== 1 || !previous.entries || typeof previous.entries !== 'object' || Array.isArray(previous.entries)
    || (previous.evaluatedVersion !== null && !version(previous.evaluatedVersion))) {
    reject('invalid committed history')
  }
  if (previous.attempt !== null || migration.recovery.length || migration.steps.some(step => step.status === 'failed')) {
    reject('interrupted migrations require a reviewed manual upgrade')
  }
  if (!equal(Object.keys(previous).sort(), ['attempt', 'entries', 'evaluatedVersion', 'schemaVersion'])
    || Object.entries(previous.entries).some(([id, entry]) => !/^[a-z][a-z\d-]*$/.test(id) || !entry
      || !equal(Object.keys(entry).sort(), ['fromVersion', 'status', 'toVersion', 'version'])
      || entry.status !== 'completed' || !version(entry.version) || !version(entry.toVersion)
      || (entry.fromVersion !== null && (!version(entry.fromVersion) || compare(entry.fromVersion, entry.toVersion) > 0))
      || compare(entry.version, entry.toVersion) > 0 || previous.evaluatedVersion === null || compare(entry.toVersion, previous.evaluatedVersion) > 0)) {
    reject('history must contain only completed records')
  }
  if (migration.fromVersion !== previous.evaluatedVersion || !version(migration.toVersion) || migration.toVersion !== templateVersion()
    || (migration.fromVersion !== null && compare(migration.fromVersion, migration.toVersion) > 0)
    || new Set(migration.steps.map(step => step.id)).size !== migration.steps.length) {
    reject('source cursor or target version differs')
  }
  const active = migration.steps.filter(step => step.status === 'pending')
  if (!active.length || migration.steps.some(step => !['pending', 'completed', 'skipped'].includes(step.status))) {
    reject('no publishable migration')
  }
  const ledgerFiles = plan.files.filter(file => file.path === policy.ledgerPath)
  const ledger = ledgerFiles[0]
  if (ledgerFiles.length !== 1 || ledger.group !== policy.group || ledger.status !== (before === null ? 'add' : 'modify')
    || ledger.baseline || (before === null) !== (ledger.beforeHash === null) || !ledger.afterHash) {
    reject('missing exact completed ledger operation')
  }
  const completedBytes = decode(ledger.content)
  if (hash(completedBytes) !== ledger.afterHash) {
    reject('completed content digest differs')
  }
  const pending = parse(decode(migration.ledger.pending))
  const failed = parse(decode(migration.ledger.failed))
  const attempt = pending?.attempt
  if (!attempt || !Array.isArray(attempt.files) || !Array.isArray(attempt.inputs) || !attempt.files.length
    || new Set(attempt.files.map(file => file.path)).size !== attempt.files.length
    || !equal(Object.keys(attempt).sort(), ['discovery', 'files', 'id', 'inputs'])
    || hash(Buffer.from(JSON.stringify({ files: attempt.files, inputs: attempt.inputs, discovery: attempt.discovery }))) !== attempt.id) {
    reject('invalid reviewed journal')
  }
  const sortFiles = files => [...files].sort((a, b) => a.path.localeCompare(b.path))
  const journalFiles = plan.files.filter(file => file.path !== policy.ledgerPath && file.group === policy.group
    && (['add', 'modify', 'delete', 'identical'].includes(file.status) || file.baseline))
  const sortInputs = inputs => [...inputs].sort((a, b) => `${a.area}:${a.path}`.localeCompare(`${b.area}:${b.path}`))
  if (!equal(sortFiles(attempt.files), sortFiles(journalFiles)) || !equal(attempt.discovery, plan.discovery)
    || !equal(sortInputs(attempt.inputs), sortInputs(plan.inputs.filter(input => !(input.area === 'target' && input.path === policy.ledgerPath))))) {
    reject('journal differs from the reviewed plan')
  }
  const entries = { ...previous.entries }
  const pendingEntries = { ...previous.entries }
  const failedEntries = { ...previous.entries }
  const migrationPaths = new Set()
  for (const step of active) {
    const definition = policy.migrations.find(item => item.id === step.id && item.version === step.version)
    if (!definition || previous.entries[step.id] || !Array.isArray(step.files) || !step.files.length
      || compare(step.version, migration.toVersion) > 0
      || (migration.fromVersion !== null && compare(step.version, migration.fromVersion) <= 0)
      || new Set(step.files).size !== step.files.length || step.files.some(filename => !definition.paths.includes(filename))) {
      reject('unknown migration identity or output path')
    }
    let detected = false
    for (const filename of definition.legacyPaths) {
      const bytes = read(filename)
      if (bytes === null) {
        continue
      }
      detected = true
      const legacy = parse(bytes)
      const operation = attempt.files.find(file => file.path === filename)
      if (!legacy || typeof legacy !== 'object' || Array.isArray(legacy)
        || (filename.endsWith('/pre.json') && (legacy.mode !== 'pre' || typeof legacy.tag !== 'string' || !legacy.tag.trim()))
        || !step.files.includes(filename) || !operation || operation.status !== 'delete' || operation.content !== null || operation.afterHash !== null) {
        reject('legacy source or its reviewed removal differs')
      }
      if (filename.endsWith('/pre.json')) {
        validateLanes(attempt.files.find(file => file.path === 'pnpm-workspace.yaml'), legacy.tag)
      }
    }
    if (!detected) {
      reject('committed legacy source is absent')
    }
    for (const filename of step.files) {
      migrationPaths.add(filename)
    }
    const entry = { version: step.version, status: 'completed', fromVersion: migration.fromVersion, toVersion: migration.toVersion }
    entries[step.id] = entry
    pendingEntries[step.id] = { ...entry, status: 'pending' }
    failedEntries[step.id] = { ...entry, status: 'failed' }
  }
  if (!equal([...migrationPaths].sort(), attempt.files.map(file => file.path).sort())) {
    reject('journal has missing or unclaimed migration outputs')
  }
  const expected = { schemaVersion: 1, evaluatedVersion: migration.toVersion, entries, attempt: null }
  if (!equal(parse(completedBytes), expected)
    || !equal(pending, { schemaVersion: 1, evaluatedVersion: previous.evaluatedVersion, entries: pendingEntries, attempt })
    || !equal(failed, { schemaVersion: 1, evaluatedVersion: previous.evaluatedVersion, entries: failedEntries, attempt })) {
    reject('completed, pending or failed history transition differs')
  }
  const operations = []
  for (const file of [...attempt.files, ledger]) {
    const digest = value => value === null || (typeof value === 'string' && /^[a-f0-9]{64}$/.test(value))
    if (!digest(file.beforeHash) || !digest(file.afterHash)
      || (file.status === 'identical' && (file.beforeHash !== file.afterHash || file.content !== null))
      || (file.status !== 'identical' && (file.beforeHash === file.afterHash
        || (file.status === 'add' ? file.beforeHash !== null : file.beforeHash === null)
        || (file.status === 'delete' ? file.afterHash !== null || file.content !== null : file.afterHash === null || typeof file.content !== 'string')))) {
      reject('invalid migration file action')
    }
    if (!plan.inputs.some(input => input.area === 'target' && input.path === file.path && input.hash === file.beforeHash)) {
      reject('missing file precondition')
    }
    if (['add', 'modify', 'delete'].includes(file.status)) {
      operations.push(file)
    }
    if (file.baseline) {
      operations.push(file.baseline)
    }
  }
  for (const file of operations) {
    if (file.content === null ? file.afterHash !== null : hash(decode(file.content)) !== file.afterHash) {
      reject('migration output digest differs')
    }
  }
  return { path: policy.ledgerPath, operations }
}
