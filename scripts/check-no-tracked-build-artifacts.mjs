import { execFileSync } from 'node:child_process'
import process from 'node:process'

const TRACKED_BUILD_ARTIFACT_PATTERNS = [
  /^(?:templates|apps|packages)\/[^/]+\/\.next\//u,
  /^(?:templates|apps|packages)\/[^/]+\/next-env\.d\.ts$/u,
  /^packages\/[^/]+\/dist\//u,
  /^apps\/[^/]+\/dist\//u,
  /^(?:templates|apps|packages)\/[^/]+\/worker-configuration\.d\.ts$/u,
]

function isTrackedBuildArtifact(file) {
  return TRACKED_BUILD_ARTIFACT_PATTERNS.some(pattern => pattern.test(file))
}

const trackedFiles = execFileSync('git', ['ls-files'], {
  encoding: 'utf8',
})
  .split('\n')
  .map(file => file.trim())
  .filter(Boolean)

const trackedArtifacts = trackedFiles.filter(isTrackedBuildArtifact)

if (trackedArtifacts.length > 0) {
  console.error('Tracked build artifacts are not allowed:')
  for (const artifact of trackedArtifacts) {
    console.error(`- ${artifact}`)
  }
  console.error('')
  console.error('Remove them from the Git index and keep them ignored instead.')
  process.exit(1)
}

console.log('No tracked build artifacts found.')
