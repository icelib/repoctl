import type { PlaywrightSettings } from '../settings'
import path from 'pathe'
import { version } from '../../../constants'

export type CapabilitySettings = PlaywrightSettings

const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`
const quote = (value: string) => `'${JSON.stringify(value).slice(1, -1).replaceAll('\\"', '"').replaceAll('\'', '\\\'')}'`

export function playwrightFiles(settings: CapabilitySettings) {
  const { options, target, workspace } = settings
  const scripts = { 'test:e2e': 'playwright test', 'test:e2e:install': 'playwright install chromium', 'lint': 'eslint .', 'typecheck': 'tsc --noEmit' }
  const dependencies = { '@playwright/test': '1.63.0', '@types/node': '^22.0.0', 'eslint': '^10.0.0', 'repoctl': `^${version}`, 'typescript': '^6.0.2', [target.name]: 'workspace:*' }
  const targetUrl = `${path.relative(workspace.directory, target.directory).split('/').map(encodeURIComponent).join('/')}/`
  const click = options.interaction.click
  const locator = 'testId' in click
    ? `page.getByTestId(${quote(click.testId)})`
    : `page.getByRole(${quote(click.role)}, { name: ${quote(click.name)}, exact: true })`
  const files: Record<string, string> = {
    'package.json': json({ name: workspace.name, type: 'module', version: '0.0.0', private: true, scripts, devDependencies: dependencies }),
    'playwright.config.ts': `import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { defineConfig, devices } from '@playwright/test'

const port = process.env.CI ? ${options.ciPort} : ${options.port}
const baseURL = \`http://127.0.0.1:\${port}\`

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL, headless: true, trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: \`pnpm run preview --host 127.0.0.1 --port \${port} --strictPort\`,
    cwd: fileURLToPath(new URL(${quote(targetUrl)}, import.meta.url)),
    url: baseURL,
    reuseExistingServer: !process.env.CI && ${options.reuseExistingServer},
    gracefulShutdown: { signal: 'SIGTERM', timeout: 5000 },
  },
})
`,
    'tests/smoke.spec.ts': `import { expect, test } from '@playwright/test'

test('serves the application', async ({ page }) => {
  const response = await page.goto(${quote(options.interaction.route)})
  expect(response?.ok()).toBe(true)
  await expect(page.locator('body')).toBeVisible()
})
`,
    'tests/interaction.spec.ts': `import { expect, test } from '@playwright/test'

test('completes the application interaction', async ({ page }) => {
  await page.goto(${quote(options.interaction.route)})
  await ${locator}.click()
  await expect(page.getByText(${quote(options.interaction.expectText)}, { exact: true })).toBeVisible()
})
`,
    'tsconfig.json': json({ compilerOptions: { target: 'ES2022', module: 'NodeNext', moduleResolution: 'NodeNext', types: ['node'], strict: true, noEmit: true, skipLibCheck: true }, include: ['playwright.config.ts', 'tests/**/*.ts'] }),
    'eslint.config.js': `import { defineEslintConfig } from 'repoctl/tooling'

export default await defineEslintConfig({ ignores: ['playwright-report/**', 'test-results/**'] })
`,
    '.gitignore': 'node_modules\nplaywright-report\ntest-results\n',
    'README.md': `# ${workspace.name}

Runs Chromium tests against \`${target.name}\`. Application sources are unchanged.

1. Run \`pnpm install\` at the workspace root and commit the resulting lockfile.
2. Install the browser explicitly: \`pnpm --filter ${workspace.name} run test:e2e:install\`.
3. Run \`pnpm test:e2e\` from the root. Turbo builds the target application's dependency closure first.

Local port: ${options.port}; CI port: ${options.ciPort}. Existing servers are reused only when explicitly enabled locally. CI always starts a dedicated server with a strict port. Playwright stops its own webServer after success, failure and interruption; a reused server belongs to its original owner. Windows uses Playwright's default process-tree cleanup.

Edit the route, click locator and expected text in \`tests/interaction.spec.ts\` when application behavior changes. Failed tests retain traces under \`test-results\`; HTML reports are in \`playwright-report\`. Run \`pnpm exec playwright show-report\` here to view the report. Browser installation never runs during capability discovery or preview.
`,
  }
  return { files: Object.fromEntries(Object.entries(files).map(([file, content]) => [`${workspace.directory}/${file}`, content])), scripts, dependencies }
}
