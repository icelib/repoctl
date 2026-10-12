import assert from 'node:assert/strict'

export function checkNimbusUpgradeWorkflow(steps) {
  const reviews = steps.filter(step => step.run === 'pnpm check:nimbus-upgrade')
  assert.equal(reviews.length, 1, 'source workflow must check Nimbus upgrade review exactly once')
  const review = reviews[0]
  const setupIndex = steps.findIndex(step => step.uses?.startsWith('actions/setup-node@'))
  const installIndex = steps.findIndex(step => step.run === 'pnpm install --frozen-lockfile')
  const reviewIndex = steps.indexOf(review)
  assert.ok(setupIndex >= 0, 'Nimbus upgrade review requires Node setup')
  assert.ok(setupIndex < reviewIndex && reviewIndex < installIndex, 'Nimbus upgrade review must run after Node setup and before dependency installation')
  assert.equal(review.if, undefined, 'Nimbus upgrade review must run on every matrix entry')
  assert.equal(review['continue-on-error'], undefined, 'Nimbus upgrade review must fail the job when review is missing')
}
