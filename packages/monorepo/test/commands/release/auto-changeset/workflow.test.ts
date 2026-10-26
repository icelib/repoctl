import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { getAutoChangesetWorkflow } from '@icebreakers/monorepo'
import { describe, expect, it } from 'vitest'
import YAML from 'yaml'

const cli = fileURLToPath(new URL('../../../../bin/repo.js', import.meta.url))

describe('automatic changeset workflow and CLI', () => {
  it('exports a configurable readonly plan followed by protected application of an immutable artifact', async () => {
    const content = await getAutoChangesetWorkflow({ environment: 'review changes', workflowPath: '.github/workflows/changes.yml', workflowName: 'Chinese 中文', planJobName: 'Preview', applyJobName: 'Commit', policyPath: '.github/policies/releases.json' })
    const workflow = YAML.parse(content)
    expect(workflow.name).toBe('Chinese 中文')
    expect(workflow.jobs.plan.permissions.contents).toBe('read')
    expect(workflow.jobs.apply.environment).toBe('review changes')
    expect(workflow.jobs.apply.permissions.contents).toBe('write')
    expect(workflow.env.REPOCTL_WORKFLOW_PATH).toBe('.github/workflows/changes.yml')
    expect(workflow.env.REPOCTL_POLICY_PATH).toBe('.github/policies/releases.json')
    // eslint-disable-next-line no-template-curly-in-string -- Assert the literal Actions expression.
    expect(content).toContain('artifact-ids: ${{ needs.plan.outputs.artifact-id }}')
    expect(content).toContain('--expected "$RUNNER_TEMP/auto-changeset-plan/auto-changeset-plan.json"')
    expect(content).not.toContain('actions/checkout')
    expect(content).not.toContain('__VERSION__')
    expect(workflow.defaults).toEqual({ run: { shell: 'bash' } })
    for (const job of Object.values(workflow.jobs) as Array<{ steps: Array<{ 'uses'?: string, 'run'?: string, 'working-directory'?: string }> }>) {
      for (const step of job.steps) {
        if (step.uses) {
          expect(step.uses).toMatch(/@[a-f\d]{40}$/u)
        }
        if (step.run) {
          // eslint-disable-next-line no-template-curly-in-string -- Assert a literal Actions working directory.
          expect(step['working-directory']).toBe('${{ runner.temp }}')
        }
        if (step.run?.includes('npm install')) {
          expect(step.run).toContain('--ignore-scripts --no-audit --no-fund --package-lock=false')
          expect(step.run).toContain('--prefix "$RUNNER_TEMP/repoctl-tools"')
        }
      }
    }
  })

  it('rejects expressions or unsafe workflow paths in exported configuration', async () => {
    // eslint-disable-next-line no-template-curly-in-string -- Expressions must be rejected as user configuration.
    await expect(getAutoChangesetWorkflow({ environment: '${{ github.actor }}' })).rejects.toThrow('literal')
    await expect(getAutoChangesetWorkflow({ workflowPath: '../bad.yml' })).rejects.toThrow('workflow path')
    await expect(getAutoChangesetWorkflow({ planJobName: 'same', applyJobName: 'same' })).rejects.toThrow('duplicate')
  })

  it('exports through the built public CLI without evaluating candidate configuration', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'repoctl-auto-cli-'))
    try {
      await writeFile(path.join(directory, 'repoctl.config.ts'), 'throw new Error("candidate configuration executed")\n')
      const output = execFileSync(process.execPath, [cli, 'release', 'auto-changeset', '--workflow', '--environment', 'custom-approval', '--out', 'workflow.yml'], { cwd: directory, encoding: 'utf8' })
      expect(output).not.toContain('Error')
      expect(await readFile(path.join(directory, 'workflow.yml'), 'utf8')).toContain('environment: "custom-approval"')
      expect(() => execFileSync(process.execPath, [cli, 'release', 'auto-changeset', '--repository', 'acme/workspace', '--pr', '17', '--apply'], { cwd: directory, stdio: 'pipe' })).toThrow()
    }
    finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
})
