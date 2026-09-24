import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import YAML from 'yaml'

const rootDir = path.dirname(
  fileURLToPath(new URL('../package.json', import.meta.url)),
)
const workflowDir = path.join(rootDir, '.github', 'workflows')
const pinnedActionPattern = /^[^/]+\/[^@]+@[0-9a-f]{40}$/
const githubExpressionPrefix = '$' + '{{'

function githubExpression(body) {
  return `${githubExpressionPrefix} ${body} }}`
}

function readWorkflow(filename) {
  const source = fs
    .readFileSync(path.join(workflowDir, filename), 'utf8')
    .replaceAll('\r\n', '\n')
  return {
    source,
    workflow: YAML.parse(source),
  }
}

function getSteps(workflow, jobName) {
  const steps = workflow.jobs?.[jobName]?.steps
  assert.ok(Array.isArray(steps), `${jobName} must define workflow steps`)
  return steps
}

function assertPinnedActions(steps, workflowName) {
  for (const step of steps) {
    if (step.uses) {
      assert.match(
        step.uses,
        pinnedActionPattern,
        `${workflowName} action must use a full commit SHA: ${step.uses}`,
      )
    }
  }
}

function checkReleaseWorkflow() {
  const { source, workflow } = readWorkflow('release.yml')
  const release = workflow.jobs?.release
  const steps = getSteps(workflow, 'release')
  const checkout = steps.find(step =>
    step.uses?.startsWith('actions/checkout@'),
  )
  const runner = steps.find(step => step.run === 'pnpm exec repo release ci')
  const branches = workflow.on?.push?.branches ?? []
  const modes = workflow.on?.workflow_dispatch?.inputs?.mode?.options ?? []

  assert.ok(source.startsWith('# repoctl-managed: release/v2\n'))
  assert.deepEqual(branches, ['main', 'alpha', 'beta', 'rc', 'next'])
  assert.deepEqual(modes, ['auto', 'prepare', 'publish', 'publish-unpublished', 'reconcile'])
  assert.equal(workflow.permissions?.contents, 'write')
  assert.equal(workflow.permissions?.['pull-requests'], 'write')
  assert.equal(workflow.permissions?.['id-token'], 'write')
  assert.equal(
    workflow.concurrency?.group,
    `${githubExpression('github.workflow')}-${githubExpression('github.ref')}`,
  )
  assert.equal(workflow.concurrency?.['cancel-in-progress'], false)
  assert.equal(workflow.env?.NPM_CONFIG_PROVENANCE, true)
  assert.equal(checkout?.with?.['fetch-depth'], 0)
  assert.ok(release)
  assert.ok(runner, 'release job must delegate to repo release ci')
  assert.equal(
    runner.env?.GITHUB_TOKEN,
    githubExpression(
      'secrets.REPOCTL_RELEASE_TOKEN || secrets.CHANGESETS_RELEASE_TOKEN || github.token',
    ),
  )
  assert.equal(
    runner.env?.REPO_RELEASE_MODE,
    githubExpression('inputs.mode || \'auto\''),
  )
  const artifact = steps.find(step => step.uses?.startsWith('actions/upload-artifact@'))
  assert.ok(artifact, 'release workflow must preserve publish diagnostics')
  assert.equal(artifact.if, githubExpression('always()'))
  assert.equal(artifact.with?.name, `npm-publish-progress-${githubExpression('github.run_id')}-${githubExpression('github.run_attempt')}`)
  assert.equal(artifact.with?.path, 'pnpm-publish-summary.json\nrepoctl-publish-progress.json\n')
  assert.equal(artifact.with?.['if-no-files-found'], 'ignore')
  assert.equal(artifact.with?.['retention-days'], 14)
  assert.notEqual(runner['continue-on-error'], true)
  assertPinnedActions(steps, 'Release')

  for (const legacyEntry of [
    'changesets/action',
    'changeset publish',
    '.changeset/pre.json',
    'peter-evans/create-pull-request',
  ]) {
    assert.ok(
      !source.includes(legacyEntry),
      `release workflow contains legacy entry: ${legacyEntry}`,
    )
  }
}

function checkCiWorkflow() {
  const { workflow } = readWorkflow('ci.yml')
  const steps = getSteps(workflow, 'build')
  const commands = steps.flatMap(step => (step.run ? [step.run] : []))

  assert.deepEqual(workflow.on?.pull_request?.types, ['opened', 'synchronize'])
  assert.deepEqual(workflow.on?.pull_request?.['paths-ignore'], [
    '**/*.md',
    'docs/**',
    '.changeset/**',
    'LICENSE*',
  ])
  assert.ok(Object.hasOwn(workflow.on ?? {}, 'workflow_dispatch'))
  assert.equal(workflow.permissions?.contents, 'read')
  assert.ok(commands.includes('pnpm install --frozen-lockfile'))
  assert.ok(commands.includes('pnpm check:workflows'))
  assert.ok(commands.includes('pnpm lint'))
  assert.ok(commands.includes('pnpm build'))
  assert.ok(commands.includes('pnpm typecheck'))
  assert.ok(commands.includes('pnpm test'))
  assert.ok(commands.includes('pnpm test:worker-types'))
  assert.ok(commands.includes('pnpm test:packaged-create'))
  assertPinnedActions(steps, 'CI')
}

function checkReleaseIntentWorkflow() {
  const { source, workflow } = readWorkflow('release-intent-check.yml')
  const job = workflow.jobs?.['release-intent']

  assert.deepEqual(workflow.on?.pull_request?.types, [
    'opened',
    'synchronize',
    'reopened',
    'ready_for_review',
  ])
  assert.ok(job, 'release intent workflow must define release-intent job')
  assert.equal(job.if, `${githubExpression('!github.event.pull_request.draft')}`)
  assert.match(source, /rg '\^packages\/\[\^\/\]\+\/'/)
  assert.match(source, /rg -v '\/dist\/'/)
  assert.doesNotMatch(source, /apps\/mock/)
  assert.match(source, /\.changeset\/\.\+\\\.md/)
}

function checkAutomaticReleaseIntentWorkflow() {
  const { source, workflow } = readWorkflow('release-intent-auto.yml')
  const job = workflow.jobs?.generate
  const steps = getSteps(workflow, 'generate')

  assert.deepEqual(workflow.on?.pull_request_target?.types, [
    'opened',
    'synchronize',
    'reopened',
    'ready_for_review',
    'labeled',
    'unlabeled',
  ])
  assert.ok(workflow.on?.workflow_dispatch?.inputs?.pr_numbers)
  assert.equal(workflow.permissions?.contents, 'write')
  assert.equal(workflow.permissions?.['pull-requests'], 'write')
  assert.ok(job)
  assert.ok(steps.some(step => step.run === 'node .github/auto-changeset/index.mjs'))
  assert.match(source, /GITHUB_TOKEN:/)
  assert.match(source, /PR_NUMBERS:/)
  assertPinnedActions(steps, 'Automatic Release Intent')
}

checkReleaseWorkflow()
checkCiWorkflow()
checkReleaseIntentWorkflow()
checkAutomaticReleaseIntentWorkflow()
console.log('CI/CD workflow contracts are valid.')
