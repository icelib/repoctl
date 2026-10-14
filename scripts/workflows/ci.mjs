import assert from 'node:assert/strict'
import { checkNimbusUpgradeWorkflow } from '../nimbus/workflow.mjs'
import { assertPinnedActions, assertReusableValidation, getSteps, readWorkflow } from './shared.mjs'

export function checkCiWorkflow(rootDir) {
  const { workflow } = readWorkflow(rootDir, 'ci.yml')
  const steps = getSteps(workflow, 'build')
  const commands = steps.flatMap(step => (step.run ? [step.run] : []))
  checkNimbusUpgradeWorkflow(steps)
  assert.equal(workflow.jobs.build['continue-on-error'], undefined)

  assertReusableValidation(workflow)
  assert.deepEqual(workflow.jobs.build.strategy.matrix, {
    'os': ['ubuntu-latest', 'windows-latest', 'macos-latest'],
    'node-version': [22, 24],
  })
  assert.ok(commands.indexOf('pnpm build') < commands.indexOf('pnpm lint'), 'CI must build delivery artifacts before lint and tests')
  assert.ok(commands.includes('pnpm install --frozen-lockfile'))
  assert.ok(commands.includes('pnpm check:workflows'))
  assert.ok(commands.includes('pnpm lint'))
  assert.ok(commands.includes('pnpm build'))
  assert.ok(commands.includes('pnpm typecheck'))
  assert.ok(commands.includes('pnpm tsd'))
  assert.ok(commands.includes('pnpm test'))
  assert.ok(commands.includes('pnpm test:worker-types'))
  assert.ok(commands.includes('pnpm test:packaged-create'))
  assert.ok(commands.includes('pnpm test:packaged-doctor'))
  assert.ok(commands.includes('pnpm test:packaged-nimbus'))
  assert.ok(commands.includes('pnpm test:packaged-react'))
  assert.ok(commands.includes('pnpm test:packaged-next'))
  assert.ok(commands.includes('pnpm test:packaged-capability'))
  assert.ok(commands.includes('pnpm test:packaged-storybook'))
  assert.ok(commands.includes('pnpm test:packaged-react-lib'))
  assert.ok(commands.includes('pnpm test:packaged-template-validation'))
  assert.ok(commands.includes('pnpm test:packaged-template-sources'))
  assert.ok(commands.includes('pnpm test:packaged-presets'))
  assert.ok(commands.includes('pnpm test:packaged-maintenance-presets'))
  assert.ok(commands.includes('pnpm test:packaged-generators'))
  assert.ok(commands.includes('pnpm test:packaged-template-parameters'))
  assertPinnedActions(steps, 'CI')
}
