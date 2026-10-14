import { execFileSync } from 'node:child_process'
import fs from 'node:fs/promises'
import process from 'node:process'
import { createGitHubClient } from '../auto-changeset/github.mjs'
import { prepareValidation } from './prepare.mjs'
import { requestReleaseValidation } from './release.mjs'
import { reportValidation } from './status.mjs'

async function main() {
  const number = Number(process.env.PR_NUMBER)
  const repository = process.env.GITHUB_REPOSITORY
  const token = process.env.GITHUB_TOKEN
  if (!repository || !token || (process.argv[2] !== 'release' && (!/^[1-9]\d*$/.test(process.env.PR_NUMBER ?? '') || !Number.isSafeInteger(number)))) {
    throw new Error('A positive PR_NUMBER, GITHUB_REPOSITORY and GITHUB_TOKEN are required.')
  }
  const client = createGitHubClient({ token, repository })
  const targetUrl = `${process.env.GITHUB_SERVER_URL ?? 'https://github.com'}/${repository}/actions/runs/${process.env.GITHUB_RUN_ID}`
  if (process.argv[2] === 'release') {
    const receipt = JSON.parse(await fs.readFile('repoctl-ci-progress.json', 'utf8'))
    const requested = await requestReleaseValidation(client, {
      receipt,
      usesEventToken: process.env.RELEASE_USES_EVENT_TOKEN === 'true',
      baseBranch: process.env.GITHUB_REF_NAME,
      defaultBranch: process.env.DEFAULT_BRANCH,
      headSha: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
      headRef: execFileSync('git', ['symbolic-ref', '--short', 'HEAD'], { encoding: 'utf8' }).trim(),
    })
    if (requested) {
      await fs.appendFile(process.env.GITHUB_STEP_SUMMARY, `Release PR #${requested}: PR checks requested; waiting for pr-ci approval.\n`)
    }
  }
  else if (process.argv[2] === 'prepare') {
    const event = JSON.parse(await fs.readFile(process.env.GITHUB_EVENT_PATH, 'utf8'))
    const expectedHeadSha = event.pull_request?.head.sha
    const outputs = await prepareValidation(client, { number, expectedHeadSha, targetUrl })
    const lines = Object.entries(outputs).map(([key, value]) => {
      if (/[\r\n]/.test(String(value))) {
        throw new Error(`Invalid multiline workflow output: ${key}`)
      }
      return `${key}=${value}\n`
    })
    await fs.appendFile(process.env.GITHUB_OUTPUT, lines.join(''))
    await fs.appendFile(process.env.GITHUB_STEP_SUMMARY, `Approved PR #${number}\n\nHead: ${outputs.head_sha}\n\nBase: ${outputs.base_sha}\n\nTest merge: ${outputs.merge_sha}\n`)
  }
  else if (process.argv[2] === 'report') {
    const result = await reportValidation(client, {
      number,
      headSha: process.env.HEAD_SHA,
      baseSha: process.env.BASE_SHA,
      runCi: process.env.RUN_CI === 'true',
      runDevcontainer: process.env.RUN_DEVCONTAINER === 'true',
      results: {
        ci: process.env.CI_RESULT,
        devcontainer: process.env.DEVCONTAINER_RESULT,
        releaseIntent: process.env.RELEASE_INTENT_RESULT,
      },
      targetUrl,
    })
    await fs.appendFile(process.env.GITHUB_STEP_SUMMARY, `${result.description}\n`)
    if (!result.success) {
      process.exitCode = 1
    }
  }
  else {
    throw new Error('Use prepare, report or release.')
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack ?? error}\n`)
  process.exitCode = 1
})
