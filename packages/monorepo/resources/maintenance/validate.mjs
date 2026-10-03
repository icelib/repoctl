/** This exact function is embedded into the exported workflow; it uses only Node built-ins. */
export async function validateMaintenanceArtifact({ cwd, directory, expected, request }) {
  const fs = await import('node:fs/promises')
  const path = await import('node:path')
  const { createHash } = await import('node:crypto')
  const { execFileSync } = await import('node:child_process')
  const hash = value => createHash('sha256').update(value).digest('hex')
  const fail = (message) => {
    throw new Error(`Maintenance publication blocked: ${message}`)
  }
  // Git filters and fsmonitor are executable configuration, including during status/checkout.
  const gitOptions = ['--no-optional-locks', '-c', 'core.fsmonitor=false']
  const execGit = args => execFileSync('git', [...gitOptions, ...args], { cwd, maxBuffer: 32 * 1024 * 1024 })
  let filterKeys
  try {
    filterKeys = execGit(['config', '--null', '--name-only', '--get-regexp', '^filter\\..*\\.(clean|smudge|process|required)$']).toString().split('\0').filter(Boolean)
  }
  catch (error) {
    if (error.status !== 1 || error.stdout?.length) {
      fail('cannot inspect Git filter configuration')
    }
    filterKeys = []
  }
  const disabled = new Map([['core.fsmonitor', 'false']])
  for (const driver of new Set(filterKeys.map(key => key.slice(0, key.lastIndexOf('.'))))) {
    for (const setting of ['clean', 'smudge', 'process', 'required']) {
      const key = `${driver}.${setting}`
      const value = setting === 'required' ? 'false' : ''
      disabled.set(key, value)
      gitOptions.push('-c', `${key}=${value}`)
    }
  }
  const git = args => execGit(args)
  const readArtifact = async (filename, limit) => {
    const file = path.join(directory, filename)
    const stat = await fs.lstat(file)
    if (!stat.isFile() || stat.nlink !== 1 || stat.size > limit) {
      fail(`invalid artifact file ${filename}`)
    }
    return fs.readFile(file)
  }
  const report = JSON.parse((await readArtifact('report.json', 5 * 1024 * 1024)).toString())
  if (report.schemaVersion !== 1 || report.kind !== 'repoctl-maintenance-upgrade'
    || report.repository !== expected.repository || report.runId !== String(expected.runId)
    || report.runAttempt !== String(expected.runAttempt) || report.head !== expected.head
    || report.base !== expected.base || report.branch !== 'repoctl/managed-assets') {
    fail('artifact belongs to another repository, commit or workflow attempt')
  }
  if (report.status === 'unchanged') {
    return { ready: false, reason: 'No managed asset changes.' }
  }
  if (report.status !== 'ready' || !Array.isArray(report.errors) || report.errors.length
    || report.versions?.status !== 'changed' || report.plan?.status !== 'ready'
    || !Array.isArray(report.plan.files) || report.plan.files.some(file => file.status === 'conflict')
    || !Array.isArray(report.checks) || report.checks.some(check => !['passed', 'skipped'].includes(check.status))
    || !['lockfile', 'install'].every(name => report.checks.some(check => check.name === name && check.status === 'passed'))
    || !report.checks.some(check => ['lint', 'typecheck', 'test'].includes(check.name) && check.status === 'passed')) {
    fail('the plan or validation did not complete successfully')
  }
  if (!expected.appConfigured) {
    fail('configure REPOCTL_APP_CLIENT_ID and REPOCTL_APP_PRIVATE_KEY with contents, pull requests and workflows write access')
  }
  const patch = await readArtifact('changes.patch', 32 * 1024 * 1024)
  if (!patch.length || hash(patch) !== report.patchHash || !Array.isArray(report.files) || !report.files.length) {
    fail('patch is missing or its digest changed')
  }
  const safePath = filename => typeof filename === 'string' && /^[\w./-]+$/.test(filename)
    && !filename.startsWith('/') && !filename.split('/').some(part => ['', '.', '..', '.git'].includes(part))
  const allowed = filename => expected.targets.some(target => filename === target || filename.startsWith(`${target}/`))
    || filename === 'pnpm-lock.yaml' || /^\.repoctl\/baselines\/root\/[a-f0-9]{64}\.json$/.test(filename)
  const names = report.files.map(file => file.path)
  if (new Set(names).size !== names.length || names.some(filename => !safePath(filename) || !allowed(filename))) {
    fail('patch includes an unapproved or duplicate path')
  }
  const mode = value => value === null || ['100644', '100755'].includes(value)
  const digest = value => value === null || (typeof value === 'string' && /^[a-f0-9]{64}$/.test(value))
  if (report.files.some(file => !mode(file.beforeMode) || !mode(file.afterMode)
    || !digest(file.beforeHash) || !digest(file.afterHash)
    || (file.beforeMode === null) !== (file.beforeHash === null)
    || (file.afterMode === null) !== (file.afterHash === null))) {
    fail('unsupported Git mode or malformed file digest')
  }
  let repository
  let branch
  let artifact
  try {
    repository = (await request('GET /repos/{owner}/{repo}', expected.coordinates)).data
    branch = (await request('GET /repos/{owner}/{repo}/branches/{branch}', { ...expected.coordinates, branch: expected.defaultBranch })).data
    artifact = (await request('GET /repos/{owner}/{repo}/actions/artifacts/{artifact_id}', { ...expected.coordinates, artifact_id: expected.artifactId })).data
  }
  catch (error) {
    fail(`repository permission or source verification failed: ${error.message}`)
  }
  if (repository.full_name !== expected.repository || repository.default_branch !== expected.defaultBranch
    || branch.commit?.sha !== expected.head || git(['rev-parse', 'HEAD']).toString().trim() !== expected.head
    || git(['status', '--porcelain', '--untracked-files=all']).length) {
    fail('the trusted default branch moved or the publication checkout is dirty')
  }
  if (String(artifact.id) !== String(expected.artifactId) || artifact.expired
    || artifact.name !== `repoctl-maintenance-${expected.runId}-${expected.runAttempt}`
    || String(artifact.workflow_run?.id) !== String(expected.runId) || artifact.workflow_run?.head_sha !== expected.head
    || typeof expected.artifactDigest !== 'string' || !/^[a-f0-9]{64}$/.test(expected.artifactDigest.replace(/^sha256:/, ''))
    || artifact.digest?.replace(/^sha256:/, '') !== expected.artifactDigest.replace(/^sha256:/, '')) {
    fail('artifact identity, immutable digest or originating workflow run does not match')
  }
  const tree = new Map(git(['ls-tree', '-r', '-z', expected.head]).toString().split('\0').filter(Boolean).map((entry) => {
    const [metadata, filename] = entry.split('\t')
    return [filename, metadata.split(' ')[0]]
  }))
  for (const file of report.files) {
    if ((tree.get(file.path) ?? null) !== file.beforeMode
      || (tree.has(file.path) ? hash(git(['show', `${expected.head}:${file.path}`])) : null) !== file.beforeHash) {
      fail(`source precondition changed: ${file.path}`)
    }
  }
  const hooks = path.join(directory, 'empty-hooks')
  await fs.mkdir(hooks, { recursive: true })
  // Persist the same policy for the subsequent create-pull-request action.
  for (const [key, value] of disabled) {
    git(['config', '--local', '--replace-all', key, value])
  }
  git(['config', '--local', 'core.hooksPath', hooks])
  // A named working base avoids create-pull-request's detached-HEAD rebase onto an unverified latest base.
  git(['check-ref-format', '--branch', expected.defaultBranch])
  git(['checkout', '-B', expected.defaultBranch, expected.head])
  git(['update-ref', `refs/remotes/origin/${expected.defaultBranch}`, expected.head])
  const patchFile = path.join(directory, 'changes.patch')
  git(['apply', '--check', '--index', '--whitespace=nowarn', patchFile])
  git(['apply', '--index', '--whitespace=nowarn', patchFile])
  const actual = git(['diff', '--cached', '--name-only', '-z', '--no-renames', '--no-ext-diff', '--no-textconv']).toString().split('\0').filter(Boolean).sort()
  if (JSON.stringify(actual) !== JSON.stringify([...names].sort())) {
    fail('patch paths differ from the reviewed report')
  }
  const index = new Map(git(['ls-files', '--stage', '-z']).toString().split('\0').filter(Boolean).map((entry) => {
    const [metadata, filename] = entry.split('\t')
    const [mode, object, stage] = metadata.split(' ')
    if (stage !== '0') {
      fail(`unmerged index entry: ${filename}`)
    }
    return [filename, { mode, object }]
  }))
  for (const file of report.files) {
    const next = index.get(file.path)
    const stat = await fs.lstat(path.join(cwd, file.path)).catch((error) => {
      if (error.code === 'ENOENT') {
        return null
      }
      throw error
    })
    if ((next?.mode ?? null) !== file.afterMode || (stat && !stat.isFile()) || Boolean(next) !== Boolean(stat)
      || (next ? hash(git(['cat-file', 'blob', next.object])) : null) !== file.afterHash) {
      fail(`patched file bytes or mode differ from the report: ${file.path}`)
    }
  }
  // Git blob identity is exact; checkout bytes may differ through built-in EOL/encoding rules.
  try {
    git(['diff', '--exit-code', '--no-ext-diff', '--no-textconv', '--ignore-submodules=none', '--', ...names])
  }
  catch {
    fail('patched checkout contents are not Git-equivalent to the verified index')
  }
  const body = [
    '<!-- repoctl-maintenance:v1 -->',
    `Synchronize repoctl root assets: ${report.versions.from} → ${report.versions.to}.`,
    `Validated source: ${report.head}; comparison: ${report.base}.`,
    '',
    ...report.plan.files.map(file => `- ${file.path}: ${file.status} (${file.reason})`),
    '',
    ...report.checks.map(check => `- ${check.name}: ${check.status}`),
    '',
    `Complete plan, patch and logs: https://github.com/${expected.repository}/actions/runs/${expected.runId}`,
    'No automatic merge or package publication is performed.',
  ].join('\n')
  const bodyFile = path.join(directory, 'verified-body.md')
  await fs.writeFile(bodyFile, `${body}\n`)
  return { ready: true, branch: report.branch, bodyFile, targetVersion: report.versions.to }
}
