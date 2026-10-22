import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
// eslint-disable-next-line e18e/ban-dependencies -- Deployment uses the same cross-platform pnpm command resolution as the build.
import { execa } from 'execa'
import { activeMatchingVersion, cloudflareClient, readDeploymentVersion } from './cloudflare.mjs'
import { assertBuildIdentity, assertDeploymentContext, buildIdentity, deploymentMessage, docsTargets, resolveChannel } from './identity.mjs'

const channel = resolveChannel(process.argv[2])
assertDeploymentContext(process.env, channel)
const root = fileURLToPath(new URL('../../', import.meta.url))
const website = path.join(root, 'templates/vitepress')
const identity = buildIdentity(process.env)
assertBuildIdentity(JSON.parse(await readFile(path.join(website, '.vitepress/dist/docs-build.json'), 'utf8')), identity)
const target = docsTargets[channel]
const client = cloudflareClient(process.env)
let versionId = await activeMatchingVersion(client, target.worker, identity)
if (!versionId) {
  const temporary = await mkdtemp(path.join(tmpdir(), 'repoctl-site-deploy-'))
  const outputFile = path.join(temporary, 'wrangler.jsonl')
  try {
    await execa('pnpm', ['exec', 'wrangler', 'deploy', '--env', target.environment, '--message', deploymentMessage(identity)], {
      cwd: website,
      env: { ...process.env, WRANGLER_OUTPUT_FILE_PATH: outputFile },
      stdio: 'inherit',
    })
    versionId = readDeploymentVersion(await readFile(outputFile, 'utf8'), target.worker, target.environment)
    const active = await activeMatchingVersion(client, target.worker, identity)
    if (active !== versionId) {
      throw new Error('The uploaded documentation version is not confirmed active; retry this same deployment.')
    }
  }
  finally {
    await rm(temporary, { recursive: true, force: true })
  }
}
const result = { versionId, url: target.url }
await writeFile(process.env.REPO_DOCS_RESULT_FILE, `${JSON.stringify(result)}\n`)
console.log(JSON.stringify(result))
