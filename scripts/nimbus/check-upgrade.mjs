import { readFileSync, realpathSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const dependencyName = '@cloudflare/nimbus-docs'
const exactVersion = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/u
const defaultTemplateDir = fileURLToPath(new URL('../../templates/nimbus', import.meta.url))
const migrationGuidance = [
  'Install with pnpm install --frozen-lockfile --ignore-scripts, then run:',
  '  pnpm --dir templates/nimbus exec nimbus-docs migrate --dry-run --json',
  'Review every applicable migration and record the evidence before running',
  '  pnpm --dir templates/nimbus exec nimbus-docs migrate',
  'Do not advance lastReviewedNimbusVersion without completing that review.',
].join('\n')

function readJson(templateDir, filename) {
  try {
    const value = JSON.parse(readFileSync(path.join(templateDir, filename), 'utf8'))
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('expected a JSON object')
    }
    return value
  }
  catch (error) {
    throw new Error(`Cannot read Nimbus ${filename}: ${error.message}`, { cause: error })
  }
}

/** Source-workspace check; importing this module does not run the CLI. */
export function checkNimbusUpgrade(templateDir = defaultTemplateDir) {
  const manifest = readJson(templateDir, 'package.json')
  const config = readJson(templateDir, 'nimbus.json')
  const version = manifest.dependencies?.[dependencyName]
  const reviewedVersion = config.lastReviewedNimbusVersion
  if (typeof version !== 'string' || !exactVersion.test(version)) {
    throw new Error(`Nimbus package.json must pin ${dependencyName} to an exact version; received ${JSON.stringify(version)}.`)
  }
  if (typeof reviewedVersion !== 'string' || !exactVersion.test(reviewedVersion)) {
    throw new Error('Nimbus nimbus.json must define an exact lastReviewedNimbusVersion.')
  }
  if (version !== reviewedVersion) {
    throw new Error(`Nimbus upgrade review is required: package.json pins ${version}, but nimbus.json was last reviewed at ${reviewedVersion}.`)
  }
  return { version, reviewedVersion }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === realpathSync(process.argv[1])) {
  try {
    const { version } = checkNimbusUpgrade(process.argv[2])
    console.log(`Nimbus upgrade review is current (${version}).`)
  }
  catch (error) {
    console.error(`${error.message}\n\n${migrationGuidance}`)
    process.exitCode = 1
  }
}
