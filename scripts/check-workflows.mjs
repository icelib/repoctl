import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { checkDevContainerWorkflow } from './devcontainer/workflow.mjs'
import { checkCiWorkflow } from './workflows/ci.mjs'
import { checkPrCiWorkflow } from './workflows/pr-ci.mjs'
import { checkAutomaticReleaseIntentWorkflow, checkReleaseIntentWorkflow } from './workflows/release-intent.mjs'
import { checkReleaseWorkflow } from './workflows/release.mjs'

const rootDir = path.dirname(
  fileURLToPath(new URL('../package.json', import.meta.url)),
)

checkPrCiWorkflow(rootDir)
checkReleaseWorkflow(rootDir)
checkCiWorkflow(rootDir)
checkReleaseIntentWorkflow(rootDir)
checkAutomaticReleaseIntentWorkflow(rootDir)
checkDevContainerWorkflow(rootDir)
console.log('CI/CD workflow contracts are valid.')
