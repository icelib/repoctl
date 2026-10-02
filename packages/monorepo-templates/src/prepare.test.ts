import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import YAML from 'yaml'
import { removePublishedReleaseState, removeSourceRepoReleaseToolingBuildStepContent, sanitizePublishedWorkspaceContent } from './prepare'
import { sanitizePublishedCiContent } from './prepare/published'

describe('consumer CI contract', () => {
  it('removes source-only script steps including conditional packaged checks', () => {
    const content = YAML.stringify({
      jobs: {
        build: {
          steps: [
            { name: 'Install', run: 'pnpm install --frozen-lockfile' },
            { name: 'Build', run: 'pnpm build' },
            { name: 'Lint', run: 'pnpm lint' },
            { name: 'Source workflow check', run: 'pnpm check:workflows' },
            { name: 'Source artifact check', run: 'pnpm check:no-tracked-build-artifacts' },
            { name: 'Packed create', if: 'linux', run: 'pnpm test:packaged-create' },
            { name: 'Packed doctor', if: 'linux', run: 'pnpm test:packaged-doctor' },
            { name: 'Future source check', run: 'pnpm run test:future-source-check' },
            { name: 'Test', run: 'pnpm test' },
          ],
        },
      },
    })
    const sanitized = YAML.parse(sanitizePublishedCiContent(content))
    expect(sanitized.jobs.build.steps.map((step: { name: string }) => step.name)).toEqual(['Install', 'Build', 'Lint', 'Test'])
    expect(sanitizePublishedCiContent(sanitizePublishedCiContent(content))).toBe(sanitizePublishedCiContent(content))
  })
})

describe('published release state', () => {
  it('does not copy source change intents into a generated workspace', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'repoctl-published-release-state-'))
    const changesetDir = path.join(root, '.changeset')
    try {
      await writeFile(path.join(root, 'sentinel.txt'), 'keep\n')
      await mkdir(changesetDir)
      await writeFile(path.join(changesetDir, 'ledger.yaml'), 'source ledger\n')
      await writeFile(path.join(changesetDir, 'auto-pr-1.md'), 'source intent\n')
      await writeFile(path.join(changesetDir, 'release.md'), 'source intent\n')
      await writeFile(path.join(changesetDir, 'README.md'), 'documentation\n')
      await writeFile(path.join(changesetDir, 'config.json'), '{}\n')

      await removePublishedReleaseState(root)

      await expect(readFile(path.join(root, 'sentinel.txt'), 'utf8')).resolves.toBe('keep\n')
      await expect(readFile(path.join(changesetDir, 'config.json'), 'utf8')).resolves.toBe('{}\n')
      await expect(readFile(path.join(changesetDir, 'README.md'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
      await expect(readdir(changesetDir)).resolves.toEqual(['config.json'])
    }
    finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})

describe('sanitizePublishedWorkspaceContent', () => {
  it('removes source repository package identities and preserves generic versioning settings', () => {
    const content = [
      'packages:',
      '  - packages/*',
      'versioning:',
      '  fixed:',
      '    - [repoctl, "@icebreakers/monorepo"]',
      '  ignore:',
      '    - private-package',
      '  lanes:',
      '    repoctl: next',
      '  changelog:',
      '    storage: repository',
      '  updateInternalDependencies: patch',
    ].join('\n')

    const workspace = YAML.parse(sanitizePublishedWorkspaceContent(content))

    expect(workspace).toEqual({
      packages: ['packages/*'],
      versioning: {
        changelog: { storage: 'repository' },
        updateInternalDependencies: 'patch',
      },
    })
  })

  it('leaves workspace files without versioning configuration unchanged', () => {
    const content = 'packages:\n  - packages/*\n'

    expect(sanitizePublishedWorkspaceContent(content)).toBe(content)
  })

  it('strips source catalogs so generated workspaces do not inherit them', () => {
    const content = [
      'packages:',
      '  - packages/*',
      'catalog:',
      '  yaml: ^2.9.0',
      'catalogs:',
      '  frontend:',
      '    vue: ^3.5.42',
      'overrides:',
      '  vite: 8.3.0',
    ].join('\n')

    const workspace = YAML.parse(sanitizePublishedWorkspaceContent(content))

    expect(workspace).toEqual({
      packages: ['packages/*'],
      overrides: {
        vite: '8.3.0',
      },
    })
    expect(workspace.catalog).toBeUndefined()
    expect(workspace.catalogs).toBeUndefined()
  })
})

describe('removeSourceRepoReleaseToolingBuildStepContent', () => {
  it('removes source-only release tooling build step from CRLF workflows', () => {
    const content = [
      'name: Release',
      '',
      'jobs:',
      '  release:',
      '    steps:',
      '      - name: Install Dependencies',
      '        run: pnpm i',
      '',
      '      - name: Build Release Tooling',
      '        run: pnpm run tooling:build',
      '',
      '      - name: Create or update Release PR',
      '        uses: peter-evans/create-pull-request@v8',
      '        with:',
      '          token: $' + '{{ secrets.GITHUB_TOKEN }}',
      '',
    ].join('\r\n')

    const nextContent = removeSourceRepoReleaseToolingBuildStepContent(content)

    expect(nextContent).toContain('Install Dependencies')
    expect(nextContent).toContain('Create or update Release PR')
    expect(nextContent).toContain('peter-evans/create-pull-request@v8')
    expect(nextContent).not.toContain('Build Release Tooling')
    expect(nextContent).not.toContain('pnpm run tooling:build')
  })
})
