import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { run } from '../packaged-template/workspace.mjs'

export function checkDocsEnvironment(workspace, packages) {
  const report = JSON.parse(run(process.execPath, ['--input-type=module', '-e', `
    import { checkEnvironmentCache } from 'repoctl'
    console.log(JSON.stringify(await checkEnvironmentCache(process.cwd(), { tasks: ['build', 'lint', 'typecheck', 'test'] })))
  `], workspace))
  for (const name of packages) {
    const tasks = report.tasks.filter(task => task.package === name)
    assert.ok(tasks.length >= 3, `${name}: inspect cached documentation tasks`)
    for (const task of tasks) {
      for (const variable of ['REPO_DOCS_CHANNEL', 'REPO_DOCS_URL']) {
        assert.equal(task.variables.find(item => item.name === variable)?.coverage, 'hash', `${name}#${task.task}: ${variable}`)
      }
    }
    assert.deepEqual(report.findings.filter(item => item.package === name && !item.suppression && item.severity !== 'info'), [])
  }
}

export function checkVitepressCache(workspace, website) {
  const hashes = (env = {}) => {
    const output = JSON.parse(run('pnpm', ['exec', 'turbo', 'run', 'build', 'lint', 'typecheck', 'test', '--filter=@icebreakers/website', '--dry=json'], workspace, env))
    return Object.fromEntries(output.tasks.filter(task => task.package === '@icebreakers/website').map(task => [task.task, task.hash]))
  }
  const assertChanged = (before, after, label) => {
    for (const task of ['build', 'lint', 'typecheck', 'test']) {
      assert.notEqual(after[task], before[task], `${label} must invalidate VitePress ${task}`)
    }
  }
  for (const file of ['index.md', '.vitepress/config.ts', 'scripts/check-locales.ts']) {
    const filename = path.join(website, file)
    const content = readFileSync(filename, 'utf8')
    const baseline = hashes()
    try {
      writeFileSync(filename, `${content}\n${file.endsWith('.md') ? '<!-- cache -->' : '// cache'}\n`)
      assertChanged(baseline, hashes(), file)
    }
    finally {
      writeFileSync(filename, content)
    }
  }
  const env = { REPO_DOCS_CHANNEL: 'preview', REPO_DOCS_URL: 'https://next.repo.icebreaker.top' }
  for (const [name, value] of [['REPO_DOCS_CHANNEL', 'stable'], ['REPO_DOCS_URL', 'https://repo.icebreaker.top']]) {
    assertChanged(hashes(env), hashes({ ...env, [name]: value }), name)
  }
}
